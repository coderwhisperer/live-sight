import { useEffect, useState } from 'react';
import { API_BASE } from '@/api/client';
import { ADAPTER_HISTORY, V1_LOSS_CURVE } from './trainingMetrics';

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

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0F172A',
        color: '#F1F5F9',
        padding: '1.5rem 1rem',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
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
            {/* Hero stat cards */}
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
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94A3B8' }}>
                      <th style={th}>Version</th>
                      <th style={thRight}>Examples</th>
                      <th style={thRight}>Corrections</th>
                      <th style={thRight}>Final loss</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ADAPTER_HISTORY.map((a) => (
                      <tr key={a.version} style={{ borderBottom: '0.5px solid #1E293B' }}>
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

            <Section title="v1 training loss">
              <LossCurve data={V1_LOSS_CURVE} />
            </Section>

            <Section title="Interactions by mode">
              {Object.keys(stats.interactions.by_mode).length === 0 ? (
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                  No interactions logged yet.
                </p>
              ) : (
                <ModeBars data={stats.interactions.by_mode} />
              )}
            </Section>

            <Section title="Recall index">
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <Stat
                  label="Indexed entries"
                  value={stats.recall.index_size.toString()}
                />
                <Stat label="Embedding model" value="multilingual MiniLM-L12-v2" />
              </div>
            </Section>

            <Section title="System">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <HealthPill label="vLLM" up={stats.system.vllm_up} />
                <HealthPill label="FastAPI" up={stats.system.fastapi_up} />
                <HealthPill label="Whisper" up={stats.system.whisper_warm} />
                <HealthPill label={stats.adapter.active} up={true} />
              </div>
            </Section>
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
        marginBottom: '1.5rem',
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

function LossCurve({ data }: { data: { step: number; loss: number }[] }) {
  const width = 600;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 24, left: 32 };
  const maxLoss = Math.max(...data.map((d) => d.loss));
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const points = data
    .map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * innerWidth;
      const y = padding.top + (1 - d.loss / maxLoss) * innerHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <polyline points={points} fill="none" stroke="#378ADD" strokeWidth="2" />
        <text x="4" y={padding.top + 8} fill="#94A3B8" fontSize="11">
          {maxLoss.toFixed(2)}
        </text>
        <text x="4" y={padding.top + innerHeight - 2} fill="#94A3B8" fontSize="11">
          0.00
        </text>
        <text x={padding.left} y={height - 6} fill="#94A3B8" fontSize="11">
          step 0
        </text>
        <text
          x={width - padding.right - 38}
          y={height - 6}
          fill="#94A3B8"
          fontSize="11"
        >
          step 100
        </text>
      </svg>
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
