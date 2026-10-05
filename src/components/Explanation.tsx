import { useId, useState, type ReactNode } from "react";

export default function Explanation({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="explanation">
      <button
        type="button"
        className="explanation-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        {label}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div id={id} className="explanation-content" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
