// Looping cartoon "video" for the login page, drawn in SVG so it ships no media file.
// Motion lives in login-scene.css; pausing is done by toggling .paused on the wrapper.
const Paper = ({ x, y, r, cls }) => (
  <g className={cls} transform={`translate(${x} ${y}) rotate(${r})`}>
    <g className="ls-float">
      <rect x="-46" y="-60" width="92" height="120" rx="14" fill="#fffdf6" stroke="#1b2440" strokeWidth="5" />
      <path d="M-28 -34h56M-28 -18h40M-28 -2h48" stroke="#c9d2e6" strokeWidth="6" strokeLinecap="round" />
      <circle cx="-14" cy="22" r="5" fill="#1b2440" />
      <circle cx="14" cy="22" r="5" fill="#1b2440" />
      <path d="M-12 36q12 12 24 0" fill="none" stroke="#1b2440" strokeWidth="5" strokeLinecap="round" />
      <circle cx="-26" cy="32" r="6" fill="#ff9db0" opacity=".7" />
      <circle cx="26" cy="32" r="6" fill="#ff9db0" opacity=".7" />
    </g>
  </g>
);

const Check = ({ x, y, d }) => (
  <g transform={`translate(${x} ${y})`}>
    <g className="ls-pop" style={{ animationDelay: d }}>
      <circle r="26" fill="#5fd3a6" stroke="#1b2440" strokeWidth="5" />
      <path d="M-11 0l7 8 15-16" fill="none" stroke="#1b2440" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </g>
);

const Star = ({ x, y, d }) => (
  <path className="ls-twinkle" style={{ animationDelay: d }} transform={`translate(${x} ${y})`}
    d="M0 -12L3 -3 12 0 3 3 0 12 -3 3 -12 0 -3 -3Z" fill="#ffe27a" />
);

export default function LoginScene({ paused }) {
  return (
    <div className={`login-scene${paused ? ' paused' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="ls-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#141b2e" />
            <stop offset="1" stopColor="#2a1f4d" />
          </linearGradient>
        </defs>
        <rect width="600" height="800" fill="url(#ls-bg)" />

        <path className="ls-blob a" d="M120 90c70-40 170 0 180 80s-60 140-140 130S20 230 40 170s20-60 80-80Z" fill="#2fb5a0" />
        <path className="ls-blob b" d="M470 520c60 10 110 80 80 150s-130 90-190 50-60-120-20-170 70-40 130-30Z" fill="#ff7a8a" />
        <path className="ls-blob c" d="M480 120c40 20 50 80 20 110s-90 20-100-20 40-110 80-90Z" fill="#ffd25e" />
        <path className="ls-blob b" d="M60 600c40-30 110-10 120 40s-40 90-90 80-70-90-30-120Z" fill="#7b6cff" />

        <path className="ls-squiggle" d="M40 420q40-40 80 0t80 0 80 0 80 0 80 0 80 0" fill="none" stroke="#ffd25e" strokeWidth="6" strokeLinecap="round" />
        <path className="ls-squiggle late" d="M80 740q30-30 60 0t60 0 60 0 60 0 60 0" fill="none" stroke="#5fd3a6" strokeWidth="6" strokeLinecap="round" />

        <Paper x={170} y={300} r={-12} cls="ls-p1" />
        <Paper x={420} y={360} r={10} cls="ls-p2" />
        <Paper x={300} y={560} r={-4} cls="ls-p3" />

        <g transform="translate(470 230)">
          <g className="ls-bounce">
            <circle r="38" fill="#ffd25e" stroke="#1b2440" strokeWidth="5" />
            <text y="-2" textAnchor="middle" fontSize="30" fontWeight="800" fill="#1b2440">₹</text>
            <circle cx="-12" cy="14" r="4" fill="#1b2440" />
            <circle cx="12" cy="14" r="4" fill="#1b2440" />
          </g>
        </g>

        <Check x={250} y={220} d="0s" />
        <Check x={500} y={470} d="1.3s" />
        <Check x={140} y={520} d="2.6s" />

        <Star x={80} y={80} d="0s" />
        <Star x={560} y={60} d=".8s" />
        <Star x={360} y={120} d="1.6s" />
        <Star x={540} y={760} d="2.4s" />
        <Star x={40} y={340} d="1.2s" />
      </svg>
      <div className="login-scene-shade" />
    </div>
  );
}
