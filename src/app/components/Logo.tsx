// Signal Desk belgisi: ko'tarilib boruvchi uchta yapon shami (favicon bilan bir xil shakl).
export default function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span className="mark" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <g stroke="var(--gold)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M5 12.5v8" opacity=".6" /><path d="M12 7.5v11" opacity=".8" /><path d="M19 2.5v13" />
        </g>
        <rect x="3.3" y="14" width="3.4" height="5" rx=".8" fill="var(--gold)" opacity=".6" />
        <rect x="10.3" y="9.5" width="3.4" height="7" rx=".8" fill="var(--gold)" opacity=".8" />
        <rect x="17.3" y="4.5" width="3.4" height="9" rx=".8" fill="var(--gold)" />
      </svg>
    </span>
  );
}
