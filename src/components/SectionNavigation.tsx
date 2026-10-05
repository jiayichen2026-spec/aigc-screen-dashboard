import { useRef, type MouseEvent } from "react";
import Icon from "./Icon";
import {
  navigationGroups,
  navigationItems,
  type SectionId,
} from "../lib/section-navigation";

type Props = {
  activeId: SectionId;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, id: SectionId) => void;
};

export function SectionLinks({
  activeId,
  onNavigate,
  prefix,
}: Props & { prefix: string }) {
  return navigationGroups.map((group, index) => (
    <div
      className="nav-group"
      key={group.label}
      role="group"
      aria-labelledby={`${prefix}-group-${index}`}
    >
      <p className="nav-label" id={`${prefix}-group-${index}`}>
        {group.label}
      </p>
      {group.items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`nav-link${activeId === item.id ? " active" : ""}`}
          aria-current={activeId === item.id ? "location" : undefined}
          onClick={(event) => onNavigate(event, item.id)}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          {activeId === item.id && (
            <span className="nav-dot" aria-hidden="true" />
          )}
        </a>
      ))}
    </div>
  ));
}

export function MobileDirectory({
  activeId,
  onNavigate,
  open,
  setOpen,
}: Props & { open: boolean; setOpen: (open: boolean) => void }) {
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="mobile-directory"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        className="directory-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-directory-links"
        onClick={() => setOpen(!open)}
      >
        <span>
          本页目录{" "}
          <strong>
            {navigationItems.find((item) => item.id === activeId)?.label}
          </strong>
        </span>
        <span className="directory-toggle-action">
          {open ? "收起 −" : "展开 +"}
        </span>
      </button>
      <nav id="mobile-directory-links" aria-label="本页导航" hidden={!open}>
        <SectionLinks
          prefix="mobile"
          activeId={activeId}
          onNavigate={onNavigate}
        />
        <p className="directory-hint">页内定位，保留当前日期和点位筛选</p>
      </nav>
    </div>
  );
}
