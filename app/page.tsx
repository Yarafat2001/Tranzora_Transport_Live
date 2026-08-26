import { screens } from "@/lib/screens";

export default function Home() {
  const boards = Array.from(new Set(screens.map((screen) => screen.board)));

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <span className="catalog-kicker">TRANZORA WORKSPACE</span>
        <h1>All pages and panels</h1>
        <p>Open any of the 120 transport management screens from one place.</p>
        <div className="catalog-stats">
          <span><b>{screens.length}</b> pages</span>
          <i />
          <span><b>{boards.length}</b> boards</span>
          <i />
          <span><b>1</b> workspace</span>
        </div>
      </section>
      <section className="catalog-content">
        <div className="catalog-toolbar">
          <div><h2>Screen directory</h2><p>Select a page to open its full panel.</p></div>
          <div className="legend-tags"><span className="tag">Overview</span><span className="tag management">Management</span><span className="tag settings">Settings</span></div>
        </div>
        <div className="board-grid">
          {boards.map((board) => {
            const boardScreens = screens.filter((screen) => screen.board === board);
            return <article className="board-card" key={board}>
              <div className="board-head"><span>BOARD {String(board).padStart(2, "0")}</span><small>{boardScreens.length} panels</small></div>
              {boardScreens.map((screen) => <a className="screen-link" href={`/screens/${screen.slug}`} key={screen.id}>
                <span><b>{screen.title}</b><small>{screen.kind.replace("-", " ")}</small></span><strong>→</strong>
              </a>)}
            </article>;
          })}
        </div>
      </section>
    </main>
  );
}
