import { Homepage } from "../hw-helper-home/Homepage";

export function WhiteBlue() {
  return (
    <div className="hw-theme hw-theme-white-blue">
      <style>{`
        .hw-theme-white-blue .hw-home {
          --night: #f3f7fc;
          --panel: #ffffff;
          --panel-hi: #e7f0fa;
          --line: rgba(35, 69, 117, .13);
          --ink: #1b2d49;
          --soft: #536981;
          --quiet: #677d95;
          --mint: #2e67ce;
          --mint-dark: #e2ecfc;
          --accent-rgb: 46, 103, 206;
          --ink-rgb: 27, 45, 73;
          --on-accent: #f8fbff;
        }
      `}</style>
      <Homepage />
    </div>
  );
}
