import { Homepage } from "../hw-helper-home/Homepage";

export function Blue() {
  return (
    <div className="hw-theme hw-theme-blue">
      <style>{`
        .hw-theme-blue .hw-home {
          --night: #123a7d;
          --panel: #18468c;
          --panel-hi: #20549a;
          --line: rgba(225, 237, 255, .18);
          --ink: #f5f8ff;
          --soft: #d0dcf1;
          --quiet: #b0c3e0;
          --mint: #9dd8f5;
          --mint-dark: #173d64;
          --accent-rgb: 157, 216, 245;
          --ink-rgb: 245, 248, 255;
          --on-accent: #11304c;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
