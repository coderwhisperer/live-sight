import { useEffect, useState } from 'react';
import { API_BASE } from '@/api/client';
import {
  ADAPTER_HISTORY,
  V1_1_LOSS_CURVE,
  V1_2_LOSS_CURVE,
  V1_LOSS_CURVE,
} from './trainingMetrics';

interface Stats {
  interactions: {
    total: number;
    corrected: number;
    by_mode: Record<string, number>;
    days_active: number;
  };
  adapter: {
    active: string;
    version: string;
  };
  recall: {
    index_size: number;
  };
  system: {
    vllm_up: boolean;
    fastapi_up: boolean;
    whisper_warm: boolean;
  };
}

interface ActivityEntry {
  ts: string;
  mode: string;
  latency_ms: number | null;
  has_correction: boolean;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const res = await fetch(`${API_BASE}/admin/stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Stats;
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchActivity() {
      try {
        const res = await fetch(`${API_BASE}/admin/recent-activity?limit=20`);
        if (!res.ok) return;
        const data = (await res.json()) as { entries?: ActivityEntry[] };
        if (!cancelled) setActivity(data.entries ?? []);
      } catch {
        // silent fail — recent activity is informational
      }
    }
    fetchActivity();
    const interval = setInterval(fetchActivity, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0F172A',
        color: '#F1F5F9',
        padding: '1.5rem 1rem',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>
            Live Sight
          </h2>
          <a
            href="#/"
            style={{ fontSize: '12px', color: '#64748B', textDecoration: 'none' }}
          >
            ← back to camera
          </a>
        </div>

        {error && !stats && (
          <div
            style={{
              padding: '1rem',
              background: '#1E293B',
              borderRadius: '8px',
              color: '#F7C1C1',
              marginBottom: '1.5rem',
            }}
          >
            Stats unavailable: {error}
          </div>
        )}

        {!stats && !error && (
          <div style={{ padding: '2rem', color: '#64748B' }}>
            Loading dashboard…
          </div>
        )}

        {stats && (
          <>
            {/* Hero stat cards — full-width row at top */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                marginBottom: '1.5rem',
              }}
            >
              <StatCard label="Active adapter" value={stats.adapter.active} />
              <StatCard
                label="Interactions"
                value={stats.interactions.total.toString()}
              />
              <StatCard
                label="Corrections"
                value={stats.interactions.corrected.toString()}
              />
              <StatCard
                label="Days active"
                value={stats.interactions.days_active.toString()}
              />
            </div>

            {/* Row 1: Adapter history + Training loss curves */}
            <TwoCol>
              <Section title="Adapter history">
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '14px',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid #334155',
                          color: '#94A3B8',
                        }}
                      >
                        <th style={th}>Version</th>
                        <th style={thRight}>Examples</th>
                        <th style={thRight}>Corrections</th>
                        <th style={thRight}>Final loss</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ADAPTER_HISTORY.map((a) => (
                        <tr
                          key={a.version}
                          style={{ borderBottom: '0.5px solid #1E293B' }}
                        >
                          <td style={{ ...td, fontWeight: 500 }}>{a.version}</td>
                          <td style={tdRight}>{a.trainedOn}</td>
                          <td style={tdRight}>{a.corrections}</td>
                          <td style={tdRight}>{a.finalLoss}</td>
                          <td style={td}>
                            <StatusBadge status={a.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Training loss across adapters">
                <LossCurves
                  series={[
                    {
                      name: 'v1',
                      color: '#85B7EB',
                      data: V1_LOSS_CURVE,
                      dashed: true,
                    },
                    {
                      name: 'v1.1 (failed)',
                      color: '#FAC775',
                      data: V1_1_LOSS_CURVE,
                    },
                    {
                      name: 'v1.2 (active)',
                      color: '#5DCAA5',
                      data: V1_2_LOSS_CURVE,
                    },
                  ]}
                />
                <p
                  style={{
                    fontSize: '11px',
                    color: '#64748B',
                    margin: '8px 0 0',
                    fontStyle: 'italic',
                  }}
                >
                  v1 reconstructed from logs; v1.1, v1.2 from trainer_state.json
                </p>
              </Section>
            </TwoCol>

            {/* Row 2: Mode breakdown + Recent activity */}
            <TwoCol>
              <Section title="Interactions by mode">
                {Object.keys(stats.interactions.by_mode).length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                    No interactions logged yet.
                  </p>
                ) : (
                  <ModeBars data={stats.interactions.by_mode} />
                )}
              </Section>

              <Section title="Recent activity">
                {activity.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                    No recent activity.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    {activity.map((entry, idx) => (
                      <ActivityRow
                        key={`${entry.ts}-${idx}`}
                        entry={entry}
                      />
                    ))}
                  </div>
                )}
              </Section>
            </TwoCol>

            {/* Row 3: Recall index + System pills */}
            <TwoCol>
              <Section title="Recall index">
                <div
                  style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}
                >
                  <Stat
                    label="Indexed entries"
                    value={stats.recall.index_size.toString()}
                  />
                  <Stat
                    label="Embedding model"
                    value="multilingual MiniLM-L12-v2"
                  />
                </div>
              </Section>

              <Section title="System">
                <div
                  style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
                >
                  <HealthPill label="vLLM" up={stats.system.vllm_up} />
                  <HealthPill label="FastAPI" up={stats.system.fastapi_up} />
                  <HealthPill label="Whisper" up={stats.system.whisper_warm} />
                  <HealthPill label={stats.adapter.active} up={true} />
                  <InfoPill label="Qwen3-VL-8B" />
                  <InfoPill label="AMD MI300X" />
                </div>
              </Section>
            </TwoCol>
          </>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 4px' };
const thRight: React.CSSProperties = { textAlign: 'right', padding: '8px 4px' };
const td: React.CSSProperties = { padding: '10px 4px' };
const tdRight: React.CSSProperties = { padding: '10px 4px', textAlign: 'right' };

// Two-column wrapper: side-by-side at desktop widths, stacks at <660px
// (auto-fit + minmax). No media queries needed.
function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '12px',
        marginBottom: '1.5rem',
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: '#1E293B',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
      }}
    >
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 500,
          color: '#94A3B8',
          margin: '0 0 12px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#1E293B',
        borderRadius: '8px',
        padding: '1rem',
      }}
    >
      <div style={{ fontSize: '13px', color: '#94A3B8' }}>{label}</div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 500,
          marginTop: '4px',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '13px', color: '#94A3B8' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: 500, marginTop: '2px' }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdapterMetrics['status'] }) {
  const colors: Record<AdapterMetrics['status'], { bg: string; text: string }> =
    {
      active: { bg: '#0F6E56', text: '#9FE1CB' },
      fallback: { bg: '#854F0B', text: '#FAC775' },
      archived: { bg: '#444441', text: '#D3D1C7' },
    };
  const c = colors[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        fontSize: '12px',
        padding: '2px 8px',
        borderRadius: '6px',
      }}
    >
      {status}
    </span>
  );
}

function HealthPill({ label, up }: { label: string; up: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: up ? '#0F6E56' : '#A32D2D',
        color: up ? '#9FE1CB' : '#F7C1C1',
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: '6px',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'currentColor',
        }}
      />
      {label}
    </span>
  );
}

// Neutral-styled pill for static system info (model name, hardware) so
// the eye reads "this is a fact" rather than "this is up/down". No
// status dot, muted slate background, hairline border.
function InfoPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#1E293B',
        color: '#94A3B8',
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: '6px',
        border: '0.5px solid #334155',
      }}
    >
      {label}
    </span>
  );
}

// Format timestamps for the Recent activity list.
//   today's entries  -> "14:32"
//   older entries    -> "5/9 14:32"
// Analyst-style scanning: HH:MM is dense, easy to skim, and naturally
// sorts. Relative-time strings ("2m ago") drift over the 5s poll
// cycle, which makes the eye work harder than necessary.
function formatTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const time = `${hh}:${mm}`;

  if (isToday) return time;

  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md} ${time}`;
}

const MODE_COLOR: Record<string, string> = {
  navigate: '#5DCAA5',
  read: '#FAC775',
  scene: '#85B7EB',
  ask: '#AFA9EC',
  recall: '#F0997B',
};

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const time = formatTime(entry.ts);
  const color = MODE_COLOR[entry.mode] ?? '#94A3B8';
  const latency =
    entry.latency_ms != null
      ? `${(entry.latency_ms / 1000).toFixed(1)}s`
      : '—';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 10px',
        background: '#0F172A',
        borderRadius: '4px',
        borderLeft: `2px solid ${color}`,
        fontSize: '12px',
      }}
    >
      <span
        style={{
          width: '60px',
          color: '#94A3B8',
          fontFamily: 'monospace',
          fontSize: '11px',
        }}
      >
        {time}
      </span>
      <span
        style={{
          color,
          fontWeight: 500,
          textTransform: 'capitalize',
          width: '60px',
        }}
      >
        {entry.mode}
      </span>
      <span style={{ color: '#94A3B8', flex: 1 }}>{latency}</span>
      {entry.has_correction && (
        <span
          style={{
            fontSize: '10px',
            background: '#854F0B',
            color: '#FAC775',
            padding: '1px 5px',
            borderRadius: '3px',
          }}
        >
          corrected
        </span>
      )}
    </div>
  );
}

interface LossSeries {
  name: string;
  color: string;
  data: { step: number; loss: number }[];
  dashed?: boolean;
}

function LossCurves({ series }: { series: LossSeries[] }) {
  const width = 600;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 36, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allPoints = series.flatMap((s) => s.data);
  const maxLoss = Math.max(...allPoints.map((p) => p.loss));
  const minStep = Math.min(...allPoints.map((p) => p.step));
  const maxStep = Math.max(...allPoints.map((p) => p.step));

  function seriesToPolyline(data: { step: number; loss: number }[]) {
    return data
      .map((d) => {
        const x =
          padding.left +
          ((d.step - minStep) / (maxStep - minStep)) * innerWidth;
        const y = padding.top + (1 - d.loss / maxLoss) * innerHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const yTicks = [0, 0.5, 1.0, 1.5, 2.0, 2.5].filter((v) => v <= maxLoss * 1.05);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', maxWidth: '100%' }}
      >
        {yTicks.map((tick) => {
          const y = padding.top + (1 - tick / maxLoss) * innerHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#1E293B"
                strokeWidth="0.5"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                fill="#64748B"
                fontSize="10"
                textAnchor="end"
              >
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        <text x={padding.left} y={height - 18} fill="#64748B" fontSize="10">
          step {minStep}
        </text>
        <text
          x={width - padding.right - 30}
          y={height - 18}
          fill="#64748B"
          fontSize="10"
        >
          step {maxStep}
        </text>

        {series.map((s) => (
          <polyline
            key={s.name}
            points={seriesToPolyline(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray={s.dashed ? '4,3' : undefined}
          />
        ))}
      </svg>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          marginTop: '8px',
          paddingLeft: `${padding.left}px`,
        }}
      >
        {series.map((s) => (
          <div
            key={s.name}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="22" height="6" style={{ display: 'block' }}>
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? '4,3' : undefined}
              />
            </svg>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {entries.map(([mode, count]) => {
        const widthPct = (count / max) * 100;
        return (
          <div
            key={mode}
            style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <span
              style={{ width: '70px', fontSize: '13px', color: '#94A3B8' }}
            >
              {mode}
            </span>
            <div
              style={{
                flex: 1,
                background: '#0F172A',
                borderRadius: '4px',
                height: '20px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  background: '#378ADD',
                  height: '100%',
                  borderRadius: '4px',
                }}
              />
            </div>
            <span
              style={{ width: '32px', fontSize: '13px', textAlign: 'right' }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Type re-export for the StatusBadge prop typing above.
type AdapterMetrics = (typeof ADAPTER_HISTORY)[number];
