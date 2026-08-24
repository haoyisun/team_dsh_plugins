// DSH 消息导航客户端插件。由 client-modules 以经典脚本方式加载。
window.__ModuleLoader__.load({
  id: "@team-dsh-plugins/message-navigator",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const RAIL_ITEM_HEIGHT = 24;
    const COMPACT_WIDTH = 680;

    function normalizeText(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function contentPreview(content, labels = {
      image: "[图片]",
      nonText: "[非文本消息]",
    }) {
      const blocks = Array.isArray(content) ? content : [content];
      const parts = [];
      for (const block of blocks) {
        if (typeof block === "string") {
          const text = normalizeText(block);
          if (text) parts.push(text);
          continue;
        }
        if (!block || typeof block !== "object") continue;
        if (block.type === "text" || typeof block.text === "string") {
          const text = normalizeText(block.text ?? block.content);
          if (text) parts.push(text);
          continue;
        }
        if (
          block.type === "image" ||
          block.type === "image_url" ||
          block.image !== undefined ||
          block.image_url !== undefined
        ) {
          parts.push(labels.image);
        }
      }
      return parts.join(" ") || labels.nonText;
    }

    function buildNavigationItems(snapshot, previewLabels) {
      const order = snapshot?.chat?.order;
      const store = snapshot?.chat?.nodes;
      if (!Array.isArray(order) || typeof store?.get !== "function") return [];
      const items = [];
      let turn = 0;
      for (const key of order) {
        const node = store.get(key);
        if (node?.kind !== "user" && node?.kind !== "steering") continue;
        const steering = node.kind === "steering";
        turn += 1;
        items.push({
          key: node.key,
          seq: node.data?.seq ?? node.anchorSeq,
          time: node.data?.time ?? 0,
          preview: contentPreview(node.data?.content, previewLabels),
          steering,
          turn,
        });
      }
      return items;
    }

    function activeIndexAtFocusLine(rows, viewportTop, viewportBottom) {
      if (!Array.isArray(rows) || rows.length === 0) return -1;
      const focusLine = viewportTop + (viewportBottom - viewportTop) * 0.5;
      let active = rows[0].index ?? 0;
      for (let index = 0; index < rows.length; index += 1) {
        if (rows[index].top > focusLine) break;
        active = rows[index].index ?? index;
      }
      return active;
    }

    function railWheel(current, delta, maximum) {
      const next = Math.max(0, Math.min(maximum, current + delta));
      return { next, consumed: next !== current };
    }

    function shouldLoadOlderAtRailTop({
      scrollTop,
      hasMore,
      loading,
      failed,
    }) {
      return Boolean(scrollTop <= 48 && hasMore && !loading && !failed);
    }

    function virtualRange({
      count,
      scrollTop,
      viewportHeight,
      itemHeight = RAIL_ITEM_HEIGHT,
      overscan = 6,
    }) {
      const first = Math.max(0, Math.floor(scrollTop / itemHeight));
      return {
        start: Math.max(0, first - overscan),
        end: Math.min(count, first + Math.ceil(viewportHeight / itemHeight) + overscan),
      };
    }

    function buildPendingItems(queue, completedTurns) {
      if (!Array.isArray(queue)) return [];
      return queue
        .filter(item => item?.placement === "steering")
        .map((item, index) => ({
          key: `pending:${item.id ?? item.messageId ?? index}`,
          turn: completedTurns + index + 1,
          pending: true,
          steering: true,
        }));
    }

    function isReplying(snapshot) {
      return Boolean(snapshot?.running);
    }

    function navigationMode(width) {
      return width < COMPACT_WIDTH ? "compact" : "rail";
    }

    function loadedEventSpan(order, store) {
      if (!Array.isArray(order) || typeof store?.get !== "function") return 0;
      let first = Infinity;
      let last = -Infinity;
      for (const key of order) {
        const seq = store.get(key)?.anchorSeq;
        if (!Number.isFinite(seq)) continue;
        first = Math.min(first, seq);
        last = Math.max(last, seq);
      }
      return first === Infinity ? 0 : last - first + 1;
    }

    const react = require("react");
    const reactDom = require("react-dom");
    const {
      createElement: h,
      useCallback,
      useEffect,
      useLayoutEffect,
      useMemo,
      useRef,
      useState,
    } = react;

    const css = [
      ".mn-root{position:fixed;z-index:35;width:40px;pointer-events:none;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family)}",
      ".mn-rail{box-sizing:border-box;width:36px;height:100%;pointer-events:auto;position:relative;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:transparent;box-shadow:none;transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease}",
      ".mn-rail:hover,.mn-rail:focus-within{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv1)}",
      ".mn-list{box-sizing:border-box;position:absolute;inset:3px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;overscroll-behavior:contain}",
      ".mn-list::-webkit-scrollbar{display:none}",
      ".mn-railHasStatus .mn-list{top:32px}",
      ".mn-railReplying .mn-list{bottom:32px}",
      ".mn-items{position:relative;width:100%}",
      ".mn-items:before{content:\"\";position:absolute;top:10px;bottom:10px;left:14px;width:1px;background:var(--dsw-alias-border-l1)}",
      ".mn-item{box-sizing:border-box;appearance:none;position:absolute;left:2px;width:24px;height:24px;margin:0;padding:0;border:1px solid transparent;background:transparent;display:flex;align-items:center;justify-content:center;gap:3px;cursor:pointer;color:inherit;font:inherit;border-radius:12px}",
      ".mn-dot{box-sizing:border-box;display:block;flex:none;aspect-ratio:1;width:5px;height:5px;min-width:0;min-height:0;overflow:hidden;line-height:0;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .16s ease,background-color .16s ease}",
      ".mn-item:not(.mn-itemActive):not(.mn-itemSteering):not(.mn-itemPending) .mn-dot{width:7px;height:7px}",
      ".mn-itemSteering .mn-dot{width:4px;height:4px}",
      ".mn-item:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".mn-item:hover .mn-dot{background:var(--dsw-alias-label-primary);transform:scale(1.2)}",
      ".mn-itemActive{left:0;width:28px;border-color:transparent;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".mn-itemActive .mn-dot{background:var(--dsw-alias-brand-primary)}",
      ".mn-turnNumber{display:none;font-size:10px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums}",
      ".mn-itemActive .mn-turnNumber{display:inline}",
      ".mn-itemPending{cursor:default}",
      ".mn-itemPending .mn-dot{width:7px;height:7px;background:transparent;border:1px solid var(--dsw-alias-label-tertiary)}",
      ".mn-itemUnavailable{opacity:.4;cursor:not-allowed}",
      ".mn-item:focus{outline:none}",
      ".mn-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
      ".mn-status{box-sizing:border-box;position:absolute;z-index:2;top:4px;left:5px;width:24px;height:24px;margin:0;padding:0;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-tertiary);font:10px/18px var(--dsw-font-family);cursor:default;display:grid;place-items:center}",
      "button.mn-status{cursor:pointer}",
      ".mn-status:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".mn-statusIcon{display:block;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}",
      ".mn-spinner{box-sizing:border-box;width:12px;height:12px;border:1.5px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-label-secondary);border-radius:50%;animation:mn-spin .8s linear infinite}",
      ".mn-streaming{box-sizing:border-box;position:absolute;z-index:2;bottom:5px;left:5px;width:24px;height:24px;padding:0;border:0;border-radius:12px;background:transparent;cursor:pointer}",
      ".mn-streaming:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".mn-streamingDot{display:block;width:6px;height:6px;margin:auto;border-radius:50%;background:var(--dsw-alias-brand-primary);animation:mn-pulse 1.2s ease-in-out infinite}",
      ".mn-compactTrigger{pointer-events:auto;position:absolute;right:0;top:50%;transform:translateY(-50%);min-width:52px;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:none;font:500 11px/30px var(--dsw-font-family);font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color .16s ease,border-color .16s ease}",
      ".mn-compactTrigger:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".mn-compactTriggerReplying:before{content:\"\";display:inline-block;width:6px;height:6px;margin-right:4px;border-radius:50%;background:var(--dsw-alias-brand-primary);animation:mn-pulse 1.2s ease-in-out infinite}",
      ".mn-rootCompact{width:52px}",
      ".mn-rootCompact .mn-rail{display:none;position:absolute;right:0;top:0}",
      ".mn-rootCompact.mn-panelOpen .mn-rail{display:block}",
      ".mn-rootCompact.mn-panelOpen .mn-compactTrigger{display:none}",
      ".mn-tooltip{box-sizing:border-box;position:fixed;z-index:37;width:288px;max-width:calc(100vw - 64px);pointer-events:none;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2);padding:10px 12px;font-family:var(--dsw-font-family)}",
      ".mn-tooltipMeta{font-size:11px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-tertiary);margin-bottom:4px}",
      ".mn-tooltipText{font-size:12px;line-height:18px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}",
      ".mn-target-flash{animation:mn-target-flash .8s ease-out}",
      "@keyframes mn-spin{to{transform:rotate(360deg)}}",
      "@keyframes mn-pulse{0%,100%{opacity:.45;box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent)}50%{opacity:1;box-shadow:0 0 0 5px transparent}}",
      "@keyframes mn-target-flash{0%{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}100%{background:transparent}}",
      "@media(prefers-reduced-motion:reduce){.mn-dot,.mn-rail,.mn-compactTrigger{transition:none}.mn-target-flash,.mn-streamingDot,.mn-compactTriggerReplying:before,.mn-spinner{animation:none}}",
    ].join("");

    function statusIcon(kind) {
      if (kind === "loading") {
        return h("span", { className: "mn-spinner", "aria-hidden": "true" });
      }
      const path = kind === "retry"
        ? "M18 8a7 7 0 1 0 1 5M18 3v5h-5"
        : "M6 9l6-6 6 6M12 3v16";
      return h(
        "svg",
        {
          className: "mn-statusIcon",
          viewBox: "0 0 24 24",
          "aria-hidden": "true",
        },
        h("path", { d: path }),
      );
    }

    const zh = {
      "rail.label": "消息导航",
      "rail.turn": "第 {turn} 个提问",
      "rail.steering": "第 {turn} 个提问（追加指令）",
      "rail.loading": "正在加载更早消息，已发现 {count} 条",
      "rail.retry": "加载失败，点击重试",
      "rail.continue": "加载更早消息",
      "rail.pending": "第 {turn} 个提问正在等待发送",
      "rail.replying": "AI 正在回复，点击返回最新内容",
      "rail.compact": "第 {turn} 个，共 {count} 个提问",
      "rail.unavailable": "该提问尚未渲染，暂时无法定位",
      "preview.image": "[图片]",
      "preview.nonText": "[非文本消息]",
    };
    const en = {
      "rail.label": "Message navigation",
      "rail.turn": "Question {turn}",
      "rail.steering": "Question {turn} (follow-up instruction)",
      "rail.loading": "Loading earlier messages, {count} found",
      "rail.retry": "Loading failed; click to retry",
      "rail.continue": "Load earlier messages",
      "rail.pending": "Question {turn} is waiting to be sent",
      "rail.replying": "AI is replying; click to return to the latest content",
      "rail.compact": "Question {turn} of {count}",
      "rail.unavailable": "This question is not rendered yet",
      "preview.image": "[image]",
      "preview.nonText": "[non-text message]",
    };
    let compatibilityWarned = false;

    function warnMissingScrollport() {
      if (compatibilityWarned || typeof document === "undefined") return;
      if (document.querySelector("[data-conversation-scroll]") !== null) return;
      compatibilityWarned = true;
      console.warn(
        "[message-navigator] DSH conversation scroll marker is unavailable; navigation is disabled.",
      );
    }

    function installStyles() {
      if (typeof document === "undefined") return () => {};
      const id = "team-dsh-message-navigator";
      const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
      if (existing !== null) return () => {};
      const tag = document.createElement("style");
      tag.dataset.pluginCss = id;
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    function anchorMap(scrollport) {
      const result = new Map();
      for (const element of scrollport.querySelectorAll("[data-chat-anchor-key]")) {
        const key = element.dataset.chatAnchorKey;
        if (key !== undefined && !result.has(key)) result.set(key, element);
      }
      return result;
    }

    function visibleBottom(scrollport) {
      const composer = scrollport.querySelector("[data-composer-seat]");
      return composer?.getBoundingClientRect().top ?? scrollport.getBoundingClientRect().bottom;
    }

    function restoredScrollTop(currentScrollTop, beforeTop, afterTop) {
      return Math.max(0, currentScrollTop + afterTop - beforeTop);
    }

    function readerAnchor(scrollport, anchors) {
      const rect = scrollport.getBoundingClientRect();
      const bottom = visibleBottom(scrollport);
      const x = rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1));
      const points = [rect.top + 1, rect.top + (bottom - rect.top) * 0.25];
      if (
        typeof document !== "undefined" &&
        typeof document.elementsFromPoint === "function"
      ) {
        for (const y of points) {
          for (const element of document.elementsFromPoint(x, y)) {
            const row = element instanceof HTMLElement
              ? element.closest("[data-chat-anchor-key]")
              : null;
            const key = row?.dataset.chatAnchorKey;
            if (row !== null && key !== undefined && scrollport.contains(row)) {
              return { key, top: row.getBoundingClientRect().top };
            }
          }
        }
      }
      for (const [key, row] of anchors) {
        const rowRect = row.getBoundingClientRect();
        if (rowRect.bottom > rect.top && rowRect.top < bottom) {
          return { key, top: rowRect.top };
        }
      }
      return null;
    }

    function afterTwoPaints() {
      return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }

    async function loadPagePreservingPosition({
      scrollport,
      getAnchors,
      loadOlder,
      afterPaint,
      refreshAnchors,
      isActive,
    }) {
      const anchor = scrollport === null
        ? null
        : readerAnchor(scrollport, getAnchors());
      const result = await loadOlder();
      if (result !== "changed" || anchor === null || scrollport === null) return result;
      await afterPaint();
      if (!isActive()) return result;
      refreshAnchors();
      const row = getAnchors().get(anchor.key);
      if (row !== undefined) {
        scrollport.scrollTop = restoredScrollTop(
          scrollport.scrollTop,
          anchor.top,
          row.getBoundingClientRect().top,
        );
      }
      return result;
    }

    function activeFromFocusLine(
      scrollport,
      itemKeys,
      anchors,
      current,
    ) {
      const rect = scrollport.getBoundingClientRect();
      const bottom = visibleBottom(scrollport);
      if (bottom <= rect.top) return current;
      const floor = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
      if (scrollport.scrollTop <= 1) return 0;
      if (floor - scrollport.scrollTop <= 1) return itemKeys.length - 1;
      const rows = [];
      for (let index = 0; index < itemKeys.length; index += 1) {
        const row = anchors.get(itemKeys[index]);
        if (row === undefined) continue;
        rows.push({ index, top: row.getBoundingClientRect().top });
      }
      const next = activeIndexAtFocusLine(rows, rect.top, bottom);
      return next < 0 ? current : next;
    }

    function MessageNavigator({ useSession, loadOlder, t }) {
      const order = useSession(snapshot => snapshot.chat.order);
      const nodeStore = useSession(snapshot => snapshot.chat.nodes);
      const openState = useSession(snapshot => snapshot.openState);
      const hasMore = useSession(snapshot => snapshot.hasMore);
      const loadingOlder = useSession(snapshot => snapshot.loadingOlder);
      const queue = useSession(snapshot => snapshot.queue);
      const running = useSession(snapshot => snapshot.running);
      const [itemsRevision, setItemsRevision] = useState(0);
      const items = useMemo(
        () => buildNavigationItems(
          { chat: { order, nodes: nodeStore } },
          {
            image: t("preview.image"),
            nonText: t("preview.nonText"),
          },
        ),
        // ChatSnapshotBuilder keeps one mutable node-store identity; only a
        // structural order change or an explicit prepend completion can
        // change the navigable projection.
        [itemsRevision, order, t],
      );
      const itemKeys = useMemo(() => items.map(item => item.key), [items]);
      const pendingItems = useMemo(
        () => buildPendingItems(queue, items.length),
        [items.length, queue],
      );
      const logicalItems = useMemo(
        () => [...items, ...pendingItems],
        [items, pendingItems],
      );
      const replying = isReplying({ running });

      const [activeKey, setActiveKey] = useState(null);
      const [layout, setLayout] = useState(null);
      const [hoveredKey, setHoveredKey] = useState(null);
      const [loadFailed, setLoadFailed] = useState(false);
      const [railScrollTop, setRailScrollTop] = useState(0);
      const [railViewportHeight, setRailViewportHeight] = useState(480);
      const [panelOpen, setPanelOpen] = useState(false);
      const rootRef = useRef(null);
      const railRef = useRef(null);
      const buttonsRef = useRef(new Map());
      const anchorsRef = useRef(new Map());
      const scrollportRef = useRef(null);
      const frameRef = useRef(0);
      const hoverOpenRef = useRef(0);
      const hoverCloseRef = useRef(0);
      const flashRef = useRef(0);
      const pointerInsideRef = useRef(false);
      const manualUntilRef = useRef(0);
      const previousActiveRef = useRef(-1);
      const mountedRef = useRef(true);
      const requestInFlightRef = useRef(false);
      const activeLockRef = useRef(null);
      const active = useMemo(() => {
        const index = items.findIndex(item => item.key === activeKey);
        return index;
      }, [activeKey, items]);
      const visibleRange = useMemo(
        () => virtualRange({
          count: logicalItems.length,
          scrollTop: railScrollTop,
          viewportHeight: railViewportHeight,
        }),
        [logicalItems.length, railScrollTop, railViewportHeight],
      );

      const refreshAnchors = useCallback(() => {
        const scrollport = scrollportRef.current;
        if (scrollport !== null) anchorsRef.current = anchorMap(scrollport);
      }, []);

      const loadPage = useCallback(async () => {
        const scrollport = scrollportRef.current;
        const result = await loadPagePreservingPosition({
          scrollport,
          getAnchors: () => anchorsRef.current,
          loadOlder,
          afterPaint: afterTwoPaints,
          refreshAnchors,
          isActive: () =>
            mountedRef.current && scrollportRef.current === scrollport,
        });
        if (result === "changed" && mountedRef.current) {
          setItemsRevision(value => value + 1);
        }
        return result;
      }, [loadOlder, refreshAnchors]);

      const requestOlder = useCallback(() => {
        if (
          requestInFlightRef.current ||
          loadingOlder ||
          !hasMore ||
          openState !== "open"
        ) return;
        requestInFlightRef.current = true;
        void loadPage().then(result => {
          if (!mountedRef.current) return;
          setLoadFailed(result === "failed");
        }).catch(() => {
          if (mountedRef.current) setLoadFailed(true);
        }).finally(() => {
          requestInFlightRef.current = false;
        });
      }, [hasMore, loadPage, loadingOlder, openState]);

      const updateActive = useCallback(() => {
        frameRef.current = 0;
        const scrollport = scrollportRef.current;
        if (scrollport === null || itemKeys.length === 0) return;
        const lockedKey = activeLockRef.current;
        if (lockedKey !== null && itemKeys.includes(lockedKey)) {
          setActiveKey(lockedKey);
          return;
        }
        setActiveKey(currentKey => {
          const current = Math.max(0, items.findIndex(item => item.key === currentKey));
          const next = activeFromFocusLine(
            scrollport,
            itemKeys,
            anchorsRef.current,
            current,
          );
          return items[next]?.key ?? currentKey;
        });
      }, [itemKeys, items]);

      useLayoutEffect(() => {
        if (items.length === 0 || typeof document === "undefined") {
          setLayout(null);
          return undefined;
        }
        const scrollport = document.querySelector("[data-conversation-scroll]");
        if (!(scrollport instanceof HTMLElement)) {
          setLayout(null);
          const warningTimer = setTimeout(warnMissingScrollport, 1000);
          return () => clearTimeout(warningTimer);
        }
        scrollportRef.current = scrollport;

        let layoutFrame = 0;
        const update = () => {
          layoutFrame = 0;
          refreshAnchors();
          if (!items.some(item => anchorsRef.current.has(item.key))) {
            setLayout(null);
            return;
          }
          const rect = scrollport.getBoundingClientRect();
          const bottom = visibleBottom(scrollport);
          const height = Math.max(0, bottom - rect.top - 16);
          const next = {
            top: Math.round(rect.top + 8),
            left: Math.round(Math.max(8, rect.right - 44)),
            height: Math.round(height),
            mode: navigationMode(rect.width),
            anchorCount: anchorsRef.current.size,
          };
          setLayout(previous => (
            previous?.top === next.top &&
            previous?.left === next.left &&
            previous?.height === next.height &&
            previous?.mode === next.mode &&
            previous?.anchorCount === next.anchorCount
              ? previous
              : next
          ));
          updateActive();
        };

        const scheduleLayout = () => {
          if (layoutFrame === 0) layoutFrame = requestAnimationFrame(update);
        };
        update();
        const resize = typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(scheduleLayout);
        resize?.observe(scrollport);
        const composer = scrollport.querySelector("[data-composer-seat]");
        if (composer !== null) resize?.observe(composer);
        const mutation = typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(scheduleLayout);
        mutation?.observe(scrollport, { childList: true, subtree: true, characterData: true });
        window.addEventListener("resize", scheduleLayout);
        return () => {
          if (layoutFrame !== 0) cancelAnimationFrame(layoutFrame);
          resize?.disconnect();
          mutation?.disconnect();
          window.removeEventListener("resize", scheduleLayout);
          if (scrollportRef.current === scrollport) scrollportRef.current = null;
        };
      }, [items, refreshAnchors, updateActive]);

      useEffect(() => {
        const scrollport = scrollportRef.current;
        if (scrollport === null || layout === null) return undefined;
        const schedule = () => {
          if (frameRef.current === 0) frameRef.current = requestAnimationFrame(updateActive);
        };
        const unlock = () => {
          activeLockRef.current = null;
          schedule();
        };
        schedule();
        scrollport.addEventListener("scroll", schedule, { passive: true });
        scrollport.addEventListener("wheel", unlock, { passive: true });
        scrollport.addEventListener("pointerdown", unlock, { passive: true });
        scrollport.addEventListener("touchstart", unlock, { passive: true });
        return () => {
          scrollport.removeEventListener("scroll", schedule);
          scrollport.removeEventListener("wheel", unlock);
          scrollport.removeEventListener("pointerdown", unlock);
          scrollport.removeEventListener("touchstart", unlock);
          if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current);
          frameRef.current = 0;
        };
      }, [layout, updateActive]);

      useEffect(() => {
        if (active < 0) return;
        const currentKey = items[active]?.key;
        if (currentKey === undefined || currentKey === previousActiveRef.current) return;
        previousActiveRef.current = currentKey;
        if (pointerInsideRef.current || Date.now() < manualUntilRef.current) return;
        const list = railRef.current;
        if (list === null) return;
        const target = active * RAIL_ITEM_HEIGHT
          - (list.clientHeight - RAIL_ITEM_HEIGHT) / 2;
        list.scrollTo({
          top: Math.max(0, target),
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }, [active, items]);

      useEffect(() => {
        if (!panelOpen) return undefined;
        const closeOutside = event => {
          if (!rootRef.current?.contains(event.target)) setPanelOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        return () => document.removeEventListener("pointerdown", closeOutside);
      }, [panelOpen]);

      useEffect(() => {
        if (layout?.mode === "rail") setPanelOpen(false);
      }, [layout?.mode]);

      useEffect(() => {
        mountedRef.current = true;
        return () => {
          mountedRef.current = false;
          clearTimeout(hoverOpenRef.current);
          clearTimeout(hoverCloseRef.current);
          clearTimeout(flashRef.current);
        };
      }, []);

      const jumpTo = index => {
        const item = items[index];
        const scrollport = scrollportRef.current;
        const row = item === undefined ? null : anchorsRef.current.get(item.key);
        if (scrollport === null || row === null || row === undefined) return;
        activeLockRef.current = item.key;
        setActiveKey(item.key);
        const viewport = scrollport.getBoundingClientRect();
        const bottom = visibleBottom(scrollport);
        const target = scrollport.scrollTop
          + row.getBoundingClientRect().top
          - viewport.top
          - (bottom - viewport.top) * 0.3;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        scrollport.scrollTo({ top: Math.max(0, target), behavior: reduced ? "auto" : "smooth" });
        row.classList.remove("mn-target-flash");
        void row.offsetWidth;
        row.classList.add("mn-target-flash");
        clearTimeout(flashRef.current);
        flashRef.current = setTimeout(() => row.classList.remove("mn-target-flash"), 800);
      };

      const showPreview = key => {
        clearTimeout(hoverCloseRef.current);
        clearTimeout(hoverOpenRef.current);
        hoverOpenRef.current = setTimeout(() => setHoveredKey(key), 250);
      };
      const hidePreview = () => {
        clearTimeout(hoverOpenRef.current);
        clearTimeout(hoverCloseRef.current);
        hoverCloseRef.current = setTimeout(() => setHoveredKey(null), 100);
      };
      const onWheel = event => {
        const list = railRef.current;
        if (list === null) return;
        const result = railWheel(
          list.scrollTop,
          event.deltaY,
          Math.max(0, list.scrollHeight - list.clientHeight),
        );
        manualUntilRef.current = Date.now() + 1500;
        if (!result.consumed) return;
        event.preventDefault();
        list.scrollTop = result.next;
      };
      const onRailScroll = event => {
        setRailScrollTop(event.currentTarget.scrollTop);
        setRailViewportHeight(event.currentTarget.clientHeight);
        if (shouldLoadOlderAtRailTop({
          scrollTop: event.currentTarget.scrollTop,
          hasMore,
          loading: loadingOlder,
          failed: loadFailed,
        })) requestOlder();
      };
      const setRailElement = element => {
        railRef.current = element;
        if (element !== null) {
          setRailScrollTop(element.scrollTop);
          setRailViewportHeight(element.clientHeight);
        }
      };
      const returnToLatest = () => {
        const scrollport = scrollportRef.current;
        const latest = items.at(-1);
        if (scrollport === null || latest === undefined) return;
        activeLockRef.current = latest.key;
        setActiveKey(latest.key);
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        scrollport.scrollTo({
          top: Math.max(0, scrollport.scrollHeight - scrollport.clientHeight),
          behavior: reduced ? "auto" : "smooth",
        });
      };
      const onPointerEnter = () => {
        pointerInsideRef.current = true;
      };
      const onPointerLeave = () => {
        pointerInsideRef.current = false;
        manualUntilRef.current = Date.now() + 1500;
        hidePreview();
      };

      if (layout === null || items.length === 0 || typeof document === "undefined") return null;

      let status = null;
      if (loadingOlder) {
        const label = t("rail.loading", { count: items.length });
        status = h(
          "div",
          {
            className: "mn-status",
            title: label,
            "aria-label": label,
            "aria-live": "polite",
          },
          statusIcon("loading"),
        );
      } else if (loadFailed) {
        const label = t("rail.retry");
        status = h("button", {
          type: "button",
          className: "mn-status",
          title: label,
          "aria-label": label,
          onClick: () => {
            setLoadFailed(false);
            requestOlder();
          },
        }, statusIcon("retry"));
      } else if (hasMore) {
        const label = t("rail.continue");
        status = h("button", {
          type: "button",
          className: "mn-status",
          title: label,
          "aria-label": label,
          onClick: requestOlder,
        }, statusIcon("load"));
      }

      const visibleItems = logicalItems.slice(visibleRange.start, visibleRange.end);
      const hoveredItem = hoveredKey === null
        ? null
        : items.find(item => item.key === hoveredKey) ?? null;
      const hoveredButton = hoveredKey === null
        ? null
        : buttonsRef.current.get(hoveredKey);
      const hoveredRect = hoveredButton?.getBoundingClientRect();
      const tooltip = hoveredItem === null || hoveredItem === undefined || hoveredRect === undefined
        ? null
        : h(
          "div",
          {
            className: "mn-tooltip",
            id: "message-navigator-tooltip",
            role: "tooltip",
            style: {
              left: Math.max(8, layout.left - 296),
              top: Math.max(8, Math.min(window.innerHeight - 104, hoveredRect.top - 18)),
            },
          },
          h(
            "div",
            { className: "mn-tooltipMeta" },
            `${hoveredItem.steering
              ? t("rail.steering", { turn: hoveredItem.turn })
              : t("rail.turn", { turn: hoveredItem.turn })} · ${new Date(hoveredItem.time).toLocaleString()}`,
          ),
          h("div", { className: "mn-tooltipText" }, hoveredItem.preview),
        );

      return reactDom.createPortal(
        h(
          "div",
          {
            ref: rootRef,
            className: [
              "mn-root",
              layout.mode === "compact" ? "mn-rootCompact" : "",
              panelOpen ? "mn-panelOpen" : "",
            ].filter(Boolean).join(" "),
            style: { top: layout.top, left: layout.left, height: layout.height },
          },
          layout.mode === "compact" && !panelOpen
            ? h(
                "button",
                {
                  type: "button",
                  className: replying
                    ? "mn-compactTrigger mn-compactTriggerReplying"
                    : "mn-compactTrigger",
                  "aria-label": t("rail.compact", {
                    turn: active < 0 ? "–" : items[active].turn,
                    count: logicalItems.length,
                  }),
                  onClick: () => setPanelOpen(true),
                },
                `${active < 0 ? "–" : items[active].turn}/${logicalItems.length}`,
              )
            : null,
          h(
            "nav",
            {
              className: [
                "mn-rail",
                status !== null ? "mn-railHasStatus" : "",
                replying ? "mn-railReplying" : "",
              ].filter(Boolean).join(" "),
              "aria-label": t("rail.label"),
              onPointerEnter,
              onPointerLeave,
              onWheel,
            },
            status,
            h(
              "div",
              { className: "mn-list", ref: setRailElement, onScroll: onRailScroll },
              h(
                "div",
                {
                  className: "mn-items",
                  style: { height: logicalItems.length * RAIL_ITEM_HEIGHT },
                },
                visibleItems.map((item, offset) => {
                  const index = visibleRange.start + offset;
                  const pending = item.pending === true;
                  const available = !pending && anchorsRef.current.has(item.key);
                  const label = pending
                    ? t("rail.pending", { turn: item.turn })
                    : item.steering
                      ? t("rail.steering", { turn: item.turn })
                      : t("rail.turn", { turn: item.turn });
                  const properties = {
                    key: item.key,
                    className: [
                      "mn-item",
                      item.steering ? "mn-itemSteering" : "",
                      pending ? "mn-itemPending" : "",
                      !pending && !available ? "mn-itemUnavailable" : "",
                      !pending && active === index ? "mn-itemActive" : "",
                    ].filter(Boolean).join(" "),
                    style: { top: index * RAIL_ITEM_HEIGHT },
                    "aria-label": available || pending ? label : `${label} · ${t("rail.unavailable")}`,
                    title: available || pending ? label : t("rail.unavailable"),
                  };
                  if (pending) {
                    return h(
                      "div",
                      { ...properties, role: "status" },
                      h("span", { className: "mn-dot", "aria-hidden": "true" }),
                    );
                  }
                  return h(
                    "button",
                    {
                      ...properties,
                      type: "button",
                      disabled: !available,
                      ref: element => {
                        if (element === null) buttonsRef.current.delete(item.key);
                        else buttonsRef.current.set(item.key, element);
                      },
                      "aria-current": active === index ? "location" : undefined,
                      "aria-describedby": hoveredKey === item.key
                        ? "message-navigator-tooltip"
                        : undefined,
                      onClick: () => jumpTo(index),
                      onFocus: () => showPreview(item.key),
                      onBlur: hidePreview,
                      onPointerEnter: () => showPreview(item.key),
                      onPointerLeave: hidePreview,
                    },
                    h("span", { className: "mn-dot", "aria-hidden": "true" }),
                    h("span", { className: "mn-turnNumber", "aria-hidden": "true" }, item.turn),
                  );
                }),
              ),
            ),
            replying
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "mn-streaming",
                    title: t("rail.replying"),
                    "aria-label": t("rail.replying"),
                    onClick: returnToLatest,
                  },
                  h("span", { className: "mn-streamingDot", "aria-hidden": "true" }),
                )
              : null,
          ),
          tooltip,
        ),
        document.body,
      );
    }

    Object.defineProperty(exports, "__test", {
      value: {
        activeIndexAtFocusLine,
        buildPendingItems,
        buildNavigationItems,
        css,
        isReplying,
        navigationMode,
        contentPreview,
        loadPagePreservingPosition,
        loadedEventSpan,
        railWheel,
        restoredScrollTop,
        shouldLoadOlderAtRailTop,
        virtualRange,
      },
    });

    const inject = ["slots", "sessions", "locale"];
    function apply(ctx) {
      ctx.effect(installStyles, "message-navigator: styles");
      ctx.effect(
        () => ctx.locale.register("messageNavigator", { zh, en }),
        "message-navigator: dictionaries",
      );
      ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "message-navigator",
            order: 20,
            locale: "messageNavigator",
            inject: sessionId => ({
              loadOlder: async () => {
                const session = ctx.sessions.binding(sessionId)?.session;
                if (session === undefined) return "failed";
                const before = session.getSnapshot();
                if (before.loadingOlder) return "busy";
                const first = before.chat.order[0];
                const span = loadedEventSpan(before.chat.order, before.chat.nodes);
                const nodeRefs = before.chat.order.map(key => before.chat.nodes.get(key));
                const hadMore = before.hasMore;
                try {
                  await session.loadOlder();
                } catch {
                  return "failed";
                }
                const after = session.getSnapshot();
                const nodesChanged =
                  after.chat.order.length !== before.chat.order.length ||
                  after.chat.order.some((key, index) =>
                    key !== before.chat.order[index] ||
                    after.chat.nodes.get(key) !== nodeRefs[index]
                  );
                if (
                  nodesChanged ||
                  after.chat.order[0] !== first ||
                  loadedEventSpan(after.chat.order, after.chat.nodes) !== span ||
                  after.hasMore !== hadMore
                ) {
                  return "changed";
                }
                return after.loadingOlder ? "busy" : "failed";
              },
            }),
          },
          MessageNavigator,
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
