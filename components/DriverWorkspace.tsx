"use client";
import { useLanguage } from "./Language";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, mutate } from "@/lib/api-client";
import { Icon } from "./WorkspaceIcons";
import LoadingState from "./LoadingState";

type DriverTrip = {
  id: string;
  reference: string;
  status: string;
  version: number;
  origin: string;
  destination: string;
  startsAt: string;
  endsAt: string;
  vehicleName: string;
  registrationNumber: string;
};
type DriverVehicle = {
  id: string;
  name: string;
  registrationNumber: string;
  vehicleType: string;
  capacity: number;
  odometer: number;
  status: string;
};
type Overview = {
  profile: {
    name: string;
    licenseNumber: string;
    licenseExpiry: string;
    status: string;
  } | null;
  scheduled: number;
  inProgress: number;
  completed: number;
  recentTrips: DriverTrip[];
  vehicles: DriverVehicle[];
};
const readableStatus = (status: string) =>
  status === "InProgress" ? "In progress" : status;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to load your workspace.";

export default function DriverWorkspace({
  route,
  query,
}: {
  route: string;
  query: string;
}) {
  const { t } = useLanguage();
  const [overview, setOverview] = useState<Overview>();
  const [trips, setTrips] = useState<{
    items: DriverTrip[];
    totalCount: number;
  }>();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string>();
  const isTrips = route === "/driver/trips",
    isVehicles = route === "/driver/vehicles";
  useEffect(() => {
    setPage(1);
  }, [query, status]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const data = await api<Overview>("v1/driver");
        if (!current) return;
        setOverview(data);
        setError("");
        if (isTrips) {
          const result = await api<{ items: DriverTrip[]; totalCount: number }>(
            `v1/driver/trips?page=${page}&pageSize=10&search=${encodeURIComponent(query)}&status=${status}`,
          );
          if (current) setTrips(result);
        }
      } catch (error) {
        if (current) setError(errorMessage(error));
      }
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [isTrips, page, query, status, refresh]);
  async function updateTrip(trip: DriverTrip) {
    setBusy(trip.id);
    setError("");
    try {
      await mutate(
        `v1/driver/trips/${trip.id}`,
        "PUT",
        { status: trip.status === "Scheduled" ? "InProgress" : "Completed" },
        trip.version,
      );
      setRefresh((value) => value + 1);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(undefined);
    }
  }
  if (!overview && !error)
    return (
      <section className="panel settings-form">
        <LoadingState
          label="Loading your driver workspace"
          description="Retrieving your assignments and vehicle information."
        />
      </section>
    );
  if (!overview)
    return (
      <section className="panel settings-form">
        <div className="empty-state">
          <Icon name="vehicle" size={30} />
          <h3>
            {error ? "Workspace unavailable" : "Getting your journey ready"}
          </h3>
          <p role={error ? "alert" : "status"}>
            {error || "Loading your assignments and vehicle information…"}
          </p>
          {error && (
            <button
              className="secondary"
              onClick={() => setRefresh((value) => value + 1)}
            >
              {t("Try again ")}</button>
          )}
        </div>
      </section>
    );
  if (isTrips && !trips && !error)
    return (
      <section className="panel settings-form">
        <LoadingState
          label="Loading assigned trips"
          description="Checking your latest dispatcher assignments."
        />
      </section>
    );
  if (!overview.profile)
    return (
      <section className="panel settings-form">
        <div className="empty-state">
          <Icon name="driver" size={34} />
          <h3>Your workspace is ready</h3>
          <p>
            Your account has not been linked to a driver record yet. Ask your
            administrator to link it in user management. Your profile and
            security settings are available now.
          </p>
          <Link className="primary button-link" href="/settings/profile">
            {t("View my profile ")}</Link>
        </div>
      </section>
    );
  const visibleTrips = isTrips ? (trips?.items ?? []) : overview.recentTrips;
  return (
    <>
      {error && (
        <p className="workspace-notice" role="alert">
          {error}
        </p>
      )}
      {!isTrips && !isVehicles && (
        <>
          <section className="panel driver-hero">
            <div>
              <span className="page-eyebrow">A CLEAR ROAD AHEAD</span>
              <h2>Good to see you, {overview.profile.name.split(" ")[0]}.</h2>
              <p>
                Your assignments, vehicles, and account. Everything you need
                <br />
                for the next leg of your journey.
              </p>
            </div>
            <Link className="primary button-link" href="/driver/trips">
              {t("View my trips ")}<Icon name="arrow" size={14} />
            </Link>
          </section>
          <div className="driver-stats">
            {[
              {
                label: "Scheduled trips",
                value: overview.scheduled,
                icon: "booking" as const,
              },
              {
                label: "On the road",
                value: overview.inProgress,
                icon: "trip" as const,
              },
              {
                label: "Completed trips",
                value: overview.completed,
                icon: "check" as const,
              },
            ].map((stat) => (
              <article className="stat-card" key={stat.label}>
                <span className="driver-stat-icon">
                  <Icon name={stat.icon} />
                </span>
                <div>
                  <small>{stat.label}</small>
                  <strong>{stat.value.toString().padStart(2, "0")}</strong>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {isVehicles ? (
        <div className="vehicle-grid">
          {overview.vehicles.length ? (
            overview.vehicles.map((vehicle) => (
              <section className="panel vehicle-card" key={vehicle.id}>
                <span className="driver-stat-icon">
                  <Icon name="vehicle" size={23} />
                </span>
                <span className="record-status">{vehicle.status}</span>
                <h3>{vehicle.name}</h3>
                <p>{vehicle.registrationNumber}</p>
                <dl className="vehicle-specs">
                  <div>
                    <dt>{t("Vehicle type")}</dt>
                    <dd>{vehicle.vehicleType}</dd>
                  </div>
                  <div>
                    <dt>{t("Capacity")}</dt>
                    <dd>{vehicle.capacity}</dd>
                  </div>
                  <div>
                    <dt>{t("Odometer")}</dt>
                    <dd>{vehicle.odometer.toLocaleString()} km</dd>
                  </div>
                </dl>
              </section>
            ))
          ) : (
            <section className="panel empty-state">
              <Icon name="vehicle" size={32} />
              <h3>No assigned vehicles</h3>
              <p>
                A vehicle appears here when your dispatcher assigns it to one of
                your trips.
              </p>
            </section>
          )}
        </div>
      ) : (
        <section className="panel settings-form">
          <div className="panel-title">
            <div>
              <h3>
                {isTrips ? "Your assigned trips" : "Your recent assignments"}
              </h3>
              <p>Only trips assigned to your driver record appear here.</p>
            </div>
            {!isTrips && (
              <Link href="/driver/trips" className="secondary button-link">
                {t("View all trips ")}</Link>
            )}
          </div>
          {isTrips && (
            <div
              className="form-actions"
              style={{ margin: "0 0 15px", border: 0, paddingTop: 0 }}
            >
              <label>
                Trip status{" "}
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">{t("All statuses")}</option>
                  {["Scheduled", "InProgress", "Completed", "Cancelled"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {readableStatus(value)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button
                className="secondary"
                onClick={() => setRefresh((value) => value + 1)}
              >
                {t("Refresh ")}</button>
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("Trip / route")}</th>
                  <th>{t("Vehicle")}</th>
                  <th>{t("Departure")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Next step")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTrips.map((trip) => (
                  <tr key={trip.id}>
                    <td>
                      <small>{trip.reference}</small>
                      <div className="trip-route">
                        {trip.origin}
                        <Icon name="arrow" size={13} />
                        {trip.destination}
                      </div>
                    </td>
                    <td>
                      {trip.vehicleName}
                      <br />
                      <small>{trip.registrationNumber}</small>
                    </td>
                    <td>
                      {new Date(trip.startsAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                      <br />
                      <small>
                        {new Date(trip.startsAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </td>
                    <td>
                      <span className="record-status" data-status={trip.status}>
                        {t(readableStatus(trip.status))}
                      </span>
                    </td>
                    <td>
                      {["Scheduled", "InProgress"].includes(trip.status) ? (
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => updateTrip(trip)}
                        >
                          {busy === trip.id ? "Updating…" : trip.status === "Scheduled" ? "Start trip" : "Complete trip"}
                        </button>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleTrips.length === 0 && (
            <div className="empty-state">
              <Icon name="trip" size={28} />
              <h3>{t("No matching trips")}</h3>
              <p>Your dispatcher’s assignments will appear here.</p>
            </div>
          )}
          {isTrips && (
            <div className="form-actions">
              <span style={{ fontSize: 11, color: "var(--ws-muted)" }}>
                {trips?.totalCount ?? 0} trips · Page {page}
              </span>
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("Previous ")}</button>
              <button
                className="secondary"
                disabled={page * 10 >= (trips?.totalCount ?? 0)}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("Next ")}</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
