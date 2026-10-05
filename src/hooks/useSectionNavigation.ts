import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  isSectionId,
  navigationItems,
  sectionAtPosition,
  type SectionId,
} from "../lib/section-navigation";

export function useSectionNavigation(ready: boolean) {
  const [activeId, setActiveId] = useState<SectionId>("overview");
  const activeRef = useRef<SectionId>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const landingHandled = useRef(false);
  const navigationFrame = useRef(0);
  const selectedPosition = useRef<{ id: SectionId; y: number } | null>(null);

  const scrollToSection = useCallback((id: SectionId) => {
    setMobileOpen(false);
    activeRef.current = id;
    setActiveId(id);
    cancelAnimationFrame(navigationFrame.current);
    navigationFrame.current = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ block: "start", behavior: "auto" });
      target?.focus({ preventScroll: true });
      selectedPosition.current = { id, y: window.scrollY };
    });
  }, []);

  const navigate = useCallback(
    (id: SectionId) => {
      landingHandled.current = true;
      if (window.location.hash !== `#${id}`) {
        window.history.pushState(window.history.state, "", `#${id}`);
      }
      scrollToSection(id);
    },
    [scrollToSection],
  );

  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(id);
  };

  useEffect(() => {
    if (ready && !landingHandled.current) {
      landingHandled.current = true;
      const id = window.location.hash.slice(1);
      if (isSectionId(id)) scrollToSection(id);
    }
  }, [ready, scrollToSection]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const mobile = document.querySelector<HTMLElement>(".mobile-directory");
      const offset = mobile?.offsetHeight ?? 0;
      const sections = navigationItems.flatMap(({ id }) => {
        const element = document.getElementById(id);
        return element
          ? [{ id, top: element.getBoundingClientRect().top }]
          : [];
      });
      // Short sections near the bottom cannot always reach the top. Preserve
      // the clicked destination while visible, until the scroll position changes.
      const selected = selectedPosition.current;
      const selectedTop = sections.find(
        (section) => section.id === selected?.id,
      )?.top;
      if (
        selected &&
        Math.abs(window.scrollY - selected.y) < 2 &&
        selectedTop !== undefined &&
        selectedTop >= 0 &&
        selectedTop < window.innerHeight
      ) {
        activeRef.current = selected.id;
        setActiveId(selected.id);
        return;
      }
      selectedPosition.current = null;
      const next = sectionAtPosition(
        sections,
        offset + 40,
        activeRef.current,
        window.scrollY > 0 &&
          window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 2,
      );
      activeRef.current = next;
      setActiveId(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const hashChanged = () => {
      const id = window.location.hash.slice(1);
      if (isSectionId(id)) scrollToSection(id);
      else if (!id) scrollToSection("overview");
    };
    const observer = new ResizeObserver(schedule);
    const main = document.getElementById("main");
    if (main) observer.observe(main);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", hashChanged);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", hashChanged);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(navigationFrame.current);
    };
  }, [scrollToSection]);

  return { activeId, mobileOpen, setMobileOpen, navigate, onNavigate };
}
