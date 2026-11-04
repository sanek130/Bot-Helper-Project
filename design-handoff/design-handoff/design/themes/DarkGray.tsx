import { Homepage } from "../hw-helper-home/Homepage";

export function DarkGray() {
  return (
    <div className="hw-theme hw-theme-dark-gray">
      <style>{`
        .hw-theme-dark-gray .hw-home {
          --night: #17191b;
          --panel: #222528;
          --panel-hi: #2c3033;
          --line: rgba(236, 239, 235, .11);
          --ink: #f0f2f0;
          --soft: #bac0bc;
          --quiet: #a0a8a3;
          --mint: #cfda91;
          --mint-dark: #262a1b;
          --accent-rgb: 207, 218, 145;
          --ink-rgb: 240, 242, 240;
          --on-accent: #252817;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
