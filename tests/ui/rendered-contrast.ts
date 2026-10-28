import type { Page } from "@playwright/test";

// axe cannot resolve many gradients/backdrop filters. Sample the actual rendered
// background with text temporarily hidden, then compare the computed text color.
export async function renderedContrast(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Measure settled text, rather than a partially transparent entrance frame.
    // Infinite decorative animations stay active and are never awaited.
    await Promise.all(document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing && timing.iterations !== Infinity;
    }).map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const samples = await page.evaluate(() => {
    const result: {
      text: string;
      selector: string;
      color: string;
      threshold: number;
      points: { x: number; y: number }[];
    }[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (
        element.closest('[aria-hidden="true"],script,style,svg,nextjs-portal')
      )
        continue;
      const style = getComputedStyle(element);
      if (style.visibility !== "visible" || !element.getClientRects().length)
        continue;
      const text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      const input =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement;
      if (
        element instanceof HTMLInputElement &&
        ["checkbox", "radio", "hidden"].includes(element.type)
      )
        continue;
      const placeholder = input && !element.value ? element.placeholder : "";
      const value = input ? element.value || placeholder : text;
      if (!value || value.length < 2) continue;
      let rect = element.getBoundingClientRect();
      if (!input) {
        const node = Array.from(element.childNodes).find(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (node) {
          const range = document.createRange();
          range.selectNode(node);
          rect = range.getBoundingClientRect();
        }
      }
      if (
        !rect.width ||
        !rect.height ||
        rect.top < 0 ||
        rect.bottom > innerHeight ||
        rect.left < 0 ||
        rect.right > innerWidth + 1
      )
        continue;
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      if (!hit || (!element.contains(hit) && !hit.contains(element))) continue;
      const color = placeholder
        ? getComputedStyle(element, "::placeholder").color
        : style.color;
      if (color === "rgba(0, 0, 0, 0)") continue;
      const size = parseFloat(style.fontSize);
      result.push({
        text: value.slice(0, 90),
        selector: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join(".")}`,
        color,
        threshold:
          size >= 24 || (size >= 18.66 && parseInt(style.fontWeight) >= 700)
            ? 3
            : 4.5,
        points: [0.25, 0.5, 0.75].map((x) => ({
          x: Math.round(rect.left + rect.width * x),
          y: Math.round(rect.top + rect.height / 2),
        })),
      });
    }
    return result;
  });
  const hiding = await page.addStyleTag({
    content:
      "body * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }",
  });
  let png: Buffer;
  try {
    png = await page.screenshot({
      fullPage: false,
      animations: "disabled",
      scale: "css",
    });
  } finally {
    await hiding.evaluate((element) =>
      element.parentNode?.removeChild(element),
    );
  }
  return page.evaluate(
    async ({ data, samples }) => {
      const picture = new Image();
      picture.src = `data:image/png;base64,${data}`;
      await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = picture.width;
      canvas.height = picture.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(picture, 0, 0);
      const luminance = (color: number[]) =>
        color
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (total, value, index) =>
              total + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      return samples
        .map((sample) => {
          const color = sample.color.match(/[\d.]+/g)!.map(Number);
          const alpha = color[3] ?? 1;
          const ratios = sample.points.map((point) => {
            const background = Array.from(
              context.getImageData(
                Math.min(canvas.width - 1, point.x),
                Math.min(canvas.height - 1, point.y),
                1,
                1,
              ).data,
            );
            const foreground = color
              .slice(0, 3)
              .map(
                (value, index) =>
                  value * alpha + background[index] * (1 - alpha),
              );
            const a = luminance(foreground),
              b = luminance(background);
            return {
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              background: background.slice(0, 3),
            };
          });
          const worst = ratios.sort((a, b) => a.ratio - b.ratio)[0];
          return {
            text: sample.text,
            selector: sample.selector,
            color: sample.color,
            threshold: sample.threshold,
            ratio: Number(worst.ratio.toFixed(2)),
            background: worst.background,
          };
        })
        .filter((sample) => sample.ratio < sample.threshold);
    },
    { data: png!.toString("base64"), samples },
  );
}
