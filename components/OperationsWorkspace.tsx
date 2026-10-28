"use client";
import { useLanguage } from "./Language";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api, mutate } from "@/lib/api-client";
import type { Screen } from "@/lib/screens";
import { Icon } from "./WorkspaceIcons";
import DriverWorkspace from "./DriverWorkspace";
import LoadingState from "./LoadingState";
import ConnectedAccounts from "./ConnectedAccounts";

type Row = {
  id: string;
  name?: string;
  reference?: string;
  status?: string;
  version: number;
  [key: string]: unknown;
};
type Page = {
  items: Row[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type Schema = {
  name: string;
  fields: string[];
  required: string[];
  statuses: string[];
  canWrite: boolean;
};
const resources = new Set([
  "customers",
  "suppliers",
  "drivers",
  "vehicles",
  "bookings",
  "trips",
  "maintenance",
  "fuel",
  "expenses",
  "income",
  "invoices",
  "payments",
  "documents",
  "notifications",
  "support",
  "users",
  "audit-logs",
]);
const relations: Record<string, string> = {
  customerId: "customers",
  driverId: "drivers",
  vehicleId: "vehicles",
  bookingId: "bookings",
  tripId: "trips",
  invoiceId: "invoices",
};
const moneyFields = new Set([
  "amount",
  "unitPrice",
  "liters",
  "capacity",
  "odometer",
]);
const dateFields = new Set([
  "licenseExpiry",
  "scheduledDate",
  "recordDate",
  "dueDate",
  "expiresOn",
]);
const label = (name: string) =>
  name
    .replace(/Id$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request.";
const localDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const liveRefreshMs = 20000;

// Records can change from another device or API replica, so live views re-read on a
// timer and whenever the tab wakes up; hidden tabs skip their tick.
function useLiveTick(enabled = true) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const wake = () => {
      if (!document.hidden) setTick((value) => value + 1);
    };
    const timer = setInterval(wake, liveRefreshMs);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled]);
  return tick;
}

function RelationField({
  field,
  value,
  required,
  onChange,
}: {
  field: string;
  value: string;
  required: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api<Page>(
        `v1/${relations[field]}?pageSize=20&search=${encodeURIComponent(search)}`,
      )
        .then((page) => {
          if (current) {
            setOptions(page.items);
            setError("");
          }
        })
        .catch((error) => {
          if (current) setError(message(error));
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [field, search]);
  return (
    <label>
      <span>
        {t(label(field))}
        {required && <span className="required-mark"> *</span>}
      </span>
      <input
        aria-label={`Search ${label(field)}`}
        placeholder="Search by name or reference"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        aria-label={`Select ${label(field)}`}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("Select ")}{label(field).toLowerCase()}</option>
        {value && !options.some((row) => row.id === value) && (
          <option value={value}>{t(String(value))}</option>
        )}
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} · {row.reference}
          </option>
        ))}
      </select>
      {error && <small role="alert">{error}</small>}
    </label>
  );
}

function UserActions({ row, onDone }: { row: Row; onDone: () => void }) {
  const { t } = useLanguage();
  const [role, setRole] = useState(String(row.role));
  const [active, setActive] = useState(row.status === "Active");
  const [driverId, setDriverId] = useState(String(row.driverId ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="user-access-controls">
      <select
        aria-label={`Role for ${row.name}`}
        value={role}
        onChange={(event) => setRole(event.target.value)}
      >
        {[
          "Super Admin",
          "Business Admin",
          "Manager",
          "Accountant",
          "Dispatcher",
          "Driver",
          "Support Staff",
          "Viewer",
        ].map((value) => (
          <option key={value} value={value}>{t(String(value))}</option>
        ))}
      </select>
      {role === "Driver" && (
        <RelationField
          field="driverId"
          value={driverId}
          required={false}
          onChange={setDriverId}
        />
      )}
      <label>
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        {t("Active ")}</label>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await mutate(
              `v1/users/${row.id}`,
              "PUT",
              {
                role,
                active,
                driverId: role === "Driver" && driverId ? driverId : null,
              },
              row.version,
            );
            onDone();
          } catch (error) {
            setError(message(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("Save access ")}</button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

function RecordForm({
  resource,
  schema,
  initial,
  onDone,
}: {
  resource: string;
  schema: Schema;
  initial?: Row;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      schema.fields.map((field) => [
        field,
        String(
          (field.endsWith("At") && initial?.[field]
            ? localDateTime(String(initial[field]))
            : initial?.[field]) ??
            (field === "status"
              ? schema.statuses[0]
              : field === "read"
                ? "false"
                : ""),
        ),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(
        schema.fields.map((field) => {
          const value = values[field];
          return [
            field,
            value === "" && (relations[field] || field === "expiresOn")
              ? null
              : moneyFields.has(field)
                ? Number(value)
                : field === "read"
                  ? value === "true"
                  : field.endsWith("At")
                    ? new Date(value).toISOString()
                    : value,
          ];
        }),
      );
      await mutate(
        `v1/${resource}${initial ? `/${initial.id}` : ""}`,
        initial ? "PUT" : "POST",
        body,
        initial?.version,
      );
      onDone();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-form record-editor">
      <div className="record-form-heading">
        <span className="record-form-icon">
          <Icon name={initial ? "edit" : "plus"} size={24} />
        </span>
        <div>
          <h2>
            {initial ? t("Edit") : t("Create")} {t(label(resource))}
          </h2>
          <p>
            {initial ? "Update the record details below." : "Enter the details for your new record."}{" "}
            {t("Required fields are marked *. ")}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          {schema.fields.map((field) =>
            relations[field] ? (
              <RelationField
                key={field}
                field={field}
                value={values[field]}
                required={schema.required.includes(field)}
                onChange={(value) =>
                  setValues((previous) => ({ ...previous, [field]: value }))
                }
              />
            ) : (
              <label key={field}>
                <span>
                  {t(label(field))}
                  {schema.required.includes(field) && (
                    <span className="required-mark"> *</span>
                  )}
                </span>
                {field === "status" || field === "read" ? (
                  <select
                    value={values[field]}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field]: event.target.value,
                      }))
                    }
                  >
                    {(field === "status"
                      ? schema.statuses
                      : ["false", "true"]
                    ).map((value) => (
                      <option key={value} value={value}>{t(String(value))}</option>
                    ))}
                  </select>
                ) : field === "notes" || field === "message" ? (
                  <textarea
                    rows={4}
                    maxLength={4000}
                    required={schema.required.includes(field)}
                    value={values[field]}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <input
                    required={schema.required.includes(field)}
                    maxLength={
                      field === "notes" || field === "message" ? 4000 : 200
                    }
                    type={
                      moneyFields.has(field)
                        ? "number"
                        : dateFields.has(field)
                          ? "date"
                          : field.endsWith("At")
                            ? "datetime-local"
                            : field === "email"
                              ? "email"
                              : "text"
                    }
                    min={moneyFields.has(field) ? "0" : undefined}
                    step={moneyFields.has(field) ? "0.01" : undefined}
                    value={values[field]}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ),
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onDone}>
            {t("Cancel ")}</button>
          <button className="primary" disabled={busy} aria-busy={busy}>
            <Icon name="check" size={18} />
            {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ResourceWorkspace({
  resource,
  route,
  query,
}: {
  resource: string;
  route: string;
  query: string;
}) {
  const { t } = useLanguage();
  const [schema, setSchema] = useState<Schema>();
  const [data, setData] = useState<Page>();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Row | "new" | null>(
    route.endsWith("/create") ? "new" : null,
  );
  const [detail, setDetail] = useState<Row>();
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleteTarget) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteTarget]);
  const recordId = route.split("/")[2];
  const detailRoute = !!recordId && /^[0-9a-f-]{36}$/i.test(recordId);
  const live = useLiveTick(!editor);
  const loaded = useRef(false);
  useEffect(() => {
    setPage(1);
  }, [query, status, pageSize]);
  useEffect(() => {
    let current = true;
    if (!loaded.current) setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const schemas = await api<Schema[]>("v1/schemas");
        if (!current) return;
        setSchema(schemas.find((schema) => schema.name === resource));
        if (detailRoute)
          setDetail(await api<Row>(`v1/${resource}/${recordId}`));
        else
          setData(
            await api<Page>(
              `v1/${resource}?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`,
            ),
          );
      } catch (error) {
        if (current) setError(message(error));
      } finally {
        if (current) {
          loaded.current = true;
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [
    resource,
    recordId,
    detailRoute,
    page,
    pageSize,
    query,
    status,
    refresh,
    live,
  ]);
  const done = () => {
    setEditor(null);
    setRefresh((value) => value + 1);
    if (route.endsWith("/create")) window.location.assign(`/${resource}`);
  };
  async function remove(row: Row) {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await mutate(
        `v1/${resource}/${row.id}`,
        "DELETE",
        undefined,
        row.version,
      );
      setRefresh((value) => value + 1);
      setDeleteTarget(null);
    } catch (error) {
      setError(message(error));
    } finally {
      setDeleting(false);
    }
  }
  if (editor && schema)
    return (
      <RecordForm
        key={editor === "new" ? "new" : editor.id}
        resource={resource}
        schema={schema}
        initial={editor === "new" ? undefined : editor}
        onDone={done}
      />
    );
  if (detailRoute && detail)
    return (
      <section className="panel settings-form record-detail">
        <div className="record-form-heading">
          <span className="record-form-icon">
            <Icon name="document" size={24} />
          </span>
          <div>
            <h2>{detail.name ?? label(resource)}</h2>
            <p>{t("Record details")}</p>
          </div>
        </div>
        <dl className="detail-list">
          {Object.entries(detail)
            .filter(([key]) => key !== "organizationId")
            .map(([key, value]) => (
              <div key={key}>
                <dt>{t(label(key))}</dt>
                <dd>{String(value ?? "—")}</dd>
              </div>
            ))}
        </dl>
        <div className="form-actions">
          {schema?.canWrite &&
            !["payments", "income", "expenses", "fuel"].includes(resource) && (
              <button className="primary" onClick={() => setEditor(detail)}>
                {t("Edit record ")}</button>
            )}
          <Link href={`/${resource}`} className="secondary button-link">
            {t("Back to list ")}</Link>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  const columns =
    resource === "users"
      ? ["name", "email", "phone", "role", "status"]
      : resource === "audit-logs"
        ? ["createdAt", "action", "resource", "recordId", "userId"]
        : [
            "name",
            "reference",
            "status",
            ...(schema?.fields ?? [])
              .filter(
                (field) =>
                  !["name", "reference", "status", "notes"].includes(field),
              )
              .slice(0, 4),
          ];
  return (
    <section className="panel settings-form resource-panel">
      <div className="panel-title">
        <h3>{t(label(resource))}</h3>
        {schema?.canWrite && (
          <button className="primary" onClick={() => setEditor("new")}>
            {t("Add record ")}</button>
        )}
        {resource === "users" && (
          <Link className="primary button-link" href="/users/create">
            {t("Add user ")}</Link>
        )}
      </div>
      <div className="resource-toolbar">
        <label>
          {t("Page size ")}<select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        {schema && (
          <label>
            {t("Status ")}<select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t("All")}</option>
              {schema.statuses.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </label>
        )}
        <button
          className="secondary"
          onClick={() => setRefresh((value) => value + 1)}
        >
          {t("Refresh ")}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <LoadingState
          label={t("Loading records")}
          description="Retrieving the latest records from your workspace."
        />
      ) : (
        <>
          <div
            className="resource-table-scroll"
            tabIndex={0}
            aria-label={`${label(resource)} records`}
          >
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{t(label(column))}</th>
                  ))}
                  {(schema || resource === "users") && (
                    <th className="actions-column">{t("Actions")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td key={column}>
                        {column === "status" ? (
                          <span
                            className={`record-status status-${String(row[column]).toLowerCase().replaceAll(" ", "-")}`}
                          >
                            {t(String(row[column] ?? "—"))}
                          </span>
                        ) : typeof row[column] === "boolean" ? (
                          row[column] ? (
                            "Yes"
                          ) : (
                            "No"
                          )
                        ) : (
                          String(row[column] ?? "—")
                        )}
                      </td>
                    ))}
                    {schema && (
                      <td className="actions-cell">
                        <div className="row-actions">
                          <Link
                            className="row-action"
                            href={`/${resource}/${row.id}`}
                            aria-label={`View ${row.name ?? "record"}`}
                          >
                            <Icon name="eye" />
                            <span className="action-tooltip">{t("View")}</span>
                          </Link>
                          {schema.canWrite &&
                            ![
                              "payments",
                              "income",
                              "expenses",
                              "fuel",
                            ].includes(resource) && (
                              <button
                                className="row-action"
                                aria-label={`Edit ${row.name ?? "record"}`}
                                onClick={() => setEditor(row)}
                              >
                                <Icon name="edit" />
                                <span className="action-tooltip">{t("Edit")}</span>
                              </button>
                            )}{" "}
                          {schema.canWrite &&
                            ![
                              "payments",
                              "income",
                              "expenses",
                              "fuel",
                              "invoices",
                            ].includes(resource) && (
                              <button
                                className="row-action destructive"
                                aria-label={`Delete ${row.name ?? "record"}`}
                                disabled={deleting}
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Icon name="trash" />
                                <span className="action-tooltip">{t("Delete")}</span>
                              </button>
                            )}
                        </div>
                      </td>
                    )}
                    {resource === "users" && (
                      <td>
                        <UserActions
                          row={row}
                          onDone={() => setRefresh((value) => value + 1)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.totalCount === 0 && (
            <p>{t("No records yet. Add your first record to get started.")}</p>
          )}
          <div className="form-actions pagination-controls">
            <span>
              {data?.totalCount ?? 0} {t("records")} · {t("Page")} {page} {t("of")}{" "}
              {Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize))}
            </span>
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("Previous ")}</button>
            <button
              className="secondary"
              disabled={page * pageSize >= (data?.totalCount ?? 0)}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("Next ")}</button>
          </div>
        </>
      )}
      <dialog
        ref={deleteDialog}
        className="delete-dialog"
        aria-labelledby="delete-record-title"
        onCancel={(event) => {
          if (deleting) event.preventDefault();
          else setDeleteTarget(null);
        }}
      >
        <span className="delete-dialog-icon">
          <Icon name="trash" size={26} />
        </span>
        <h2 id="delete-record-title">{t("Delete this record?")}</h2>
        <p>
          <strong>{deleteTarget?.name ?? "This record"}</strong> {t("will be permanently deleted. Related or financial records may prevent deletion. ")}</p>
        {deleteTarget && error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button
            className="secondary"
            autoFocus
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            {t("Cancel ")}</button>
          <button
            className="danger-button"
            disabled={deleting}
            onClick={() => deleteTarget && remove(deleteTarget)}
          >
            {deleting ? "Deleting…" : "Delete record"}
          </button>
        </div>
      </dialog>
    </section>
  );
}

function Dashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState<Record<string, string | number>>();
  const [error, setError] = useState("");
  const live = useLiveTick();
  useEffect(() => {
    api<Record<string, string | number>>("v1/dashboard")
      .then(setData)
      .catch((error) => setError(message(error)));
  }, [live]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <p>
        {t("Current totals across your workspace. Receipts include invoice payments and separately recorded other income. Expenses include fuel, completed maintenance, and separately recorded expenses; avoid entering these costs twice. Cash surplus is a cash summary, not an accrual profit statement. ")}</p>
      <div className="stats-grid">
        {data ? Object.entries(data)
              .filter(([key]) => key !== "currency")
              .map(([key, value]) => (
                <article className="stat-card" key={key}>
                  <div className="stat-copy">
                    <span>{t(label(key))}</span>
                    <strong>
                      {typeof value === "number"
                        ? value.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : value}
                    </strong>
                    <small>
                      {[
                        "receipts",
                        "expenses",
                        "cashSurplus",
                        "outstanding",
                      ].includes(key)
                        ? data.currency
                        : "Workspace total"}
                    </small>
                  </div>
                </article>
              )) : !error && (
              <LoadingState
                label={t("Loading workspace totals")}
                description="Preparing your latest operational summary."
              />
            )}
      </div>
    </>
  );
}

function AccountForm({ kind }: { kind: "profile" | "settings" | "password" | "users";
}) {
  const { t } = useLanguage();
  // Mirrors ValidatePassword in the .NET authentication service.
  const passwordRule = (field: string) =>
    field === "password" || field === "newPassword"
      ? {
          minLength: 8,
          pattern: "(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{8,128}",
          title:
            "Use 8-128 characters with at least one letter, one number and one symbol.",
        }
      : {};
  const [values, setValues] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(
    kind === "profile" || kind === "settings",
  );
  useEffect(() => {
    if (kind === "profile" || kind === "settings")
      api<Record<string, string | number>>(`v1/${kind}`)
        .then((data) => {
          setValues(
            Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, String(value)]),
            ),
          );
          setVersion(Number(data.version ?? 0));
        })
        .catch((error) => setNotice(message(error)))
        .finally(() => setLoading(false));
  }, [kind]);
  const fields =
    kind === "password"
      ? ["currentPassword", "newPassword"]
      : kind === "users"
        ? [
            "name",
            "email",
            "phone",
            "role",
            "password",
            ...(values.role === "Driver" ? ["driverId"] : []),
          ]
        : kind === "settings"
          ? ["name"]
          : ["name", "phone"];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const body: Record<string, unknown> = Object.fromEntries(
        fields.map((field) => [
          field,
          field === "driverId" && !values[field] ? null : (values[field] ?? ""),
        ]),
      );
      if (kind === "settings") body.version = version;
      const result = await mutate<{ version?: number }>(
        `v1/${kind}`,
        kind === "password" || kind === "users" ? "POST" : "PUT",
        body,
        kind === "profile" ? version : undefined,
      );
      if (result.version !== undefined) setVersion(result.version);
      setNotice("Saved successfully.");
      if (kind === "profile")
        window.dispatchEvent(new Event("tranzora:profile-updated"));
      if (kind === "password") window.location.assign("/login");
      if (kind === "users") window.location.assign("/users");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={kind === "profile" ? "account-layout" : ""}>
      {kind === "profile" && (
        <aside className="panel profile-summary">
          <div className="profile-orbit" aria-hidden>
            <span className="avatar">
              {(values.name ?? "Your profile")
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <i className="orbit-dot" />
            <i className="orbit-dot" />
          </div>
          <h2>{values.name ?? "Your profile"}</h2>
          <span className="role-badge">
            <span />
            {values.role ?? "Workspace member"}
          </span>
          <p>{values.email ?? "Loading your account…"}</p>
          <div className="profile-detail">
            <Icon name="building" size={17} />
            <span>
              <small>{t("Workspace")}</small>
              <b>{t("Connected transport operations")}</b>
            </span>
          </div>
          <div className="profile-detail">
            <Icon name="lock" size={17} />
            <span>
              <small>{t("Account access")}</small>
              <b>{t("Secure password sign-in")}</b>
            </span>
          </div>
          <Link href="/settings/security/password">
            <Icon name="lock" size={14} />
            {t("Manage account security ")}<Icon name="arrow" size={13} />
          </Link>
        </aside>
      )}
      <div>
        <section className="panel settings-form">
          <div className="account-panel-header">
            <span>
              <Icon
                name={
                  kind === "password"
                    ? "lock"
                    : kind === "settings"
                      ? "building"
                      : "user"
                }
                size={20}
              />
            </span>
            <div>
              <h3>
                {kind === "users" ? "Create a team account" : kind === "profile" ? "Personal information" : kind === "password" ? "Password & security" : "Workspace information"}
              </h3>
              <p>
                {kind === "profile" ? "Keep your details up to date. This is how your team knows you." : kind === "password" ? "Choose a strong password to keep your workspace secure." : "Manage the details that keep your workspace connected."}
              </p>
            </div>
          </div>
          {kind === "profile" && (
            <dl className="account-meta">
              <div>
                <dt>{t("Email address")}</dt>
                <dd>{values.email ?? "Loading…"}</dd>
              </div>
              <div>
                <dt>{t("Workspace role")}</dt>
                <dd>{values.role ?? "Loading…"}</dd>
              </div>
            </dl>
          )}
          {kind === "settings" && (
            <p>
              {t("Currency: ")}{values.currency ?? "BDT"}. Currency conversion is not
              enabled.
            </p>
          )}
          {loading && (
            <div className="account-loading">
              <LoadingState
                label="Loading account details"
                description="Your saved information will appear shortly."
              />
            </div>
          )}
          <form onSubmit={submit} aria-busy={loading || busy}>
            <div className="form-grid">
              {fields.map((field) =>
                field === "driverId" ? (
                  <RelationField
                    key={field}
                    field="driverId"
                    value={values.driverId ?? ""}
                    required={false}
                    onChange={(value) =>
                      setValues((previous) => ({
                        ...previous,
                        driverId: value,
                      }))
                    }
                  />
                ) : (
                  <label key={field}>
                    {field === "name" && kind === "profile" ? "Full name" : field === "phone" ? "Phone number" : label(field)}
                    {field === "role" ? (
                      <select
                        required
                        disabled={loading || busy}
                        value={values[field] ?? ""}
                        onChange={(event) =>
                          setValues((values) => ({
                            ...values,
                            [field]: event.target.value,
                          }))
                        }
                      >
                        <option value="">{t("Select a role")}</option>
                        {[
                          "Super Admin",
                          "Business Admin",
                          "Manager",
                          "Accountant",
                          "Dispatcher",
                          "Driver",
                          "Support Staff",
                          "Viewer",
                        ].map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        required={field !== "phone"}
                        disabled={loading || busy}
                        type={
                          field.toLowerCase().includes("password")
                            ? "password"
                            : field === "email"
                              ? "email"
                              : "text"
                        }
                        {...passwordRule(field)}
                        maxLength={
                          field.toLowerCase().includes("password") ? 128 : 200
                        }
                        value={values[field] ?? ""}
                        onChange={(event) =>
                          setValues((values) => ({
                            ...values,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ),
              )}
            </div>
            {notice && (
              <p
                className={
                  notice === "Saved successfully."
                    ? "account-notice"
                    : undefined
                }
                role={notice === "Saved successfully." ? "status" : "alert"}
              >
                {notice}
              </p>
            )}
            <div className="form-actions">
              {kind === "profile" && (
                <span className="profile-hint">
                  <Icon name="lock" size={13} />
                  {t("Your information stays in your workspace. ")}</span>
              )}
              <button
                className="primary"
                aria-busy={busy}
                disabled={
                  busy ||
                  ((kind === "profile" || kind === "settings") && !values.name)
                }
              >
                {busy ? "Saving…" : kind === "profile" ? t("Save changes") : kind === "password" ? "Update password" : t("Save changes")}
              </button>
            </div>
          </form>
        </section>
        {kind === "profile" && <ConnectedAccounts />}
        {kind === "profile" && (
          <div className="account-note">
            <Icon name="users" size={18} />
            <div>
              <b>{t("A workspace that knows you.")}</b>
              <p>
                {t("Your role determines which pages and actions are available. Contact your workspace administrator if you need a different level of access. ")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperationsWorkspace({
  screen,
  query,
}: {
  screen: Screen;
  query: string;
}) {
  const { t } = useLanguage();
  let resource = screen.route.split("/")[1];
  if (resource === "help-support") resource = "support";
  if (screen.route.startsWith("/reports/")) {
    const candidate = screen.route.split("/")[2];
    if (resources.has(candidate)) resource = candidate;
  }
  let content;
  if (screen.route === "/driver" || screen.route.startsWith("/driver/"))
    content = <DriverWorkspace route={screen.route} query={query} />;
  else if (screen.route.startsWith("/settings/security"))
    content = <AccountForm kind="password" />;
  else if (screen.route.startsWith("/settings/profile"))
    content = <AccountForm kind="profile" />;
  else if (
    screen.route === "/settings" ||
    ["/settings/company", "/settings/general", "/settings/workspace"].includes(
      screen.route,
    )
  )
    content = <AccountForm kind="settings" />;
  else if (screen.route === "/users/create")
    content = <AccountForm kind="users" />;
  else if (resources.has(resource))
    content = (
      <ResourceWorkspace
        key={screen.route}
        resource={resource}
        route={screen.route}
        query={query}
      />
    );
  else if (
    [
      "dashboard",
      "analytics",
      "reports",
      "finance",
      "revenue",
      "performance",
    ].includes(resource)
  )
    content = <Dashboard />;
  else
    content = (
      <section className="panel settings-form">
        <h3>{t(screen.title)}</h3>
        <p>
          {screen.kind === "map" ? "Live GPS and map services need a configured provider. Manage vehicle and trip records from the navigation." : screen.kind === "permissions" ? "Role policies are enforced by the API. Administrators can assign roles through user management; editing permission policies in the browser is not enabled." : screen.kind === "database" || screen.kind === "backup" ? "Database maintenance, backup and restore are deployment operations. Follow the operations guide in the repository." : screen.kind === "integrations" ||
                    screen.kind === "subscription" ? "External billing and provider integrations require provider credentials and a configured integration. No connection or payment has been simulated." : "This screen has no configured backend workflow yet. Use the operational modules in the navigation."}
        </p>
      </section>
    );
  return <div data-live-workspace>{content}</div>;
}
