import { Homepage } from "../hw-helper-home/Homepage";

export function Purple() {
  return (
    <div className="hw-theme hw-theme-purple">
      <style>{`
        .hw-theme-purple .hw-home {
          --night: #1b1420;
          --panel: #251c2c;
          --panel-hi: #32243a;
          --line: rgba(238, 220, 244, .12);
          --ink: #f5eff7;
          --soft: #cbbbd0;
          --quiet: #a18fa7;
          --mint: #d3a6df;
          --mint-dark: #321f39;
          --accent-rgb: 211, 166, 223;
          --ink-rgb: 245, 239, 247;
          --on-accent: #2b1a31;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
