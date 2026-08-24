// DSH 消息导航客户端插件。由 client-modules 以经典脚本方式加载。
window.__ModuleLoader__.load({
  id: "@team-dsh-plugins/message-navigator",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const AUTO_HISTORY_EVENT_LIMIT = 2000;

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
        if (!steering) turn += 1;
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

    function activeIndexAtReadingLine(rows, viewportTop, viewportBottom) {
      if (!Array.isArray(rows) || rows.length === 0) return -1;
      const readingLine = viewportTop + (viewportBottom - viewportTop) * 0.25;
      let active = 0;
      for (let index = 0; index < rows.length; index += 1) {
        if (rows[index].top > readingLine) break;
        active = index;
      }
      return active;
    }

    function railWheel(current, delta, maximum) {
      const next = Math.max(0, Math.min(maximum, current + delta));
      return { next, consumed: next !== current };
    }

    function shouldAutoLoad({
      loadedEvents,
      hasMore,
      loading,
      limit = AUTO_HISTORY_EVENT_LIMIT,
    }) {
      return Boolean(hasMore && !loading && loadedEvents < limit);
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
      ".mn-root{position:fixed;z-index:35;width:32px;pointer-events:none;color:var(--dsw-alias-label-secondary)}",
      ".mn-rail{box-sizing:border-box;width:32px;height:100%;pointer-events:auto;position:relative}",
      ".mn-list{box-sizing:border-box;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;padding:8px 4px;overscroll-behavior:contain}",
      ".mn-list::-webkit-scrollbar{display:none}",
      ".mn-list:before{content:\"\";position:absolute;z-index:-1;top:10px;bottom:10px;left:15px;width:1px;background:var(--dsw-alias-border-l1)}",
      ".mn-item{box-sizing:border-box;width:24px;height:24px;margin:0;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:inherit;border-radius:12px}",
      ".mn-itemSteering{transform:translateX(3px)}",
      ".mn-dot{box-sizing:border-box;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .12s,box-shadow .12s,background .12s}",
      ".mn-itemSteering .mn-dot{width:4px;height:4px}",
      ".mn-item:hover .mn-dot{background:var(--dsw-alias-label-primary);transform:scale(1.25)}",
      ".mn-itemActive .mn-dot{background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-base),0 0 0 4px var(--dsw-alias-label-primary)}",
      ".mn-item:focus{outline:none}",
      ".mn-item:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}",
      ".mn-status{box-sizing:border-box;width:24px;min-height:24px;margin:0 0 4px;padding:1px;border:0;border-radius:12px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-tertiary);font:10px/18px var(--dsw-font-family);cursor:default;text-align:center}",
      "button.mn-status{cursor:pointer}",
      ".mn-status:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".mn-tooltip{box-sizing:border-box;position:fixed;z-index:36;width:320px;max-width:calc(100vw - 64px);pointer-events:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2);padding:9px 11px;font-family:var(--dsw-font-family)}",
      ".mn-tooltipMeta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin-bottom:3px}",
      ".mn-tooltipText{font-size:12px;line-height:18px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere}",
      ".mn-target-flash{animation:mn-target-flash .8s ease-out}",
      "@keyframes mn-target-flash{0%{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}100%{background:transparent}}",
      "@media(prefers-reduced-motion:reduce){.mn-dot{transition:none}.mn-target-flash{animation:none}}",
    ].join("");

    const zh = {
      "rail.label": "消息导航",
      "rail.turn": "第 {turn} 个提问",
      "rail.steering": "第 {turn} 个提问的追加指令",
      "rail.loading": "正在加载更早消息，已发现 {count} 条",
      "rail.retry": "加载失败，点击重试",
      "rail.continue": "已达到自动加载上限，点击继续加载",
      "preview.image": "[图片]",
      "preview.nonText": "[非文本消息]",
    };
    const en = {
      "rail.label": "Message navigation",
      "rail.turn": "Question {turn}",
      "rail.steering": "Follow-up instruction for question {turn}",
      "rail.loading": "Loading earlier messages, {count} found",
      "rail.retry": "Loading failed; click to retry",
      "rail.continue": "Automatic loading limit reached; click to continue",
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

    function activeFromReadingLine(
      scrollport,
      orderPositions,
      itemKeys,
      anchors,
      current,
    ) {
      const rect = scrollport.getBoundingClientRect();
      const bottom = visibleBottom(scrollport);
      if (bottom <= rect.top) return current;
      const x = rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1));
      const y = rect.top + (bottom - rect.top) * 0.25;
      if (typeof document.elementsFromPoint === "function") {
        for (const element of document.elementsFromPoint(x, y)) {
          let row = element instanceof HTMLElement
            ? element.closest("[data-chat-anchor-key]")
            : null;
          while (row !== null && scrollport.contains(row)) {
            const position = orderPositions.get(row.dataset.chatAnchorKey);
            if (position !== undefined) return position;
            row = row.parentElement?.closest("[data-chat-anchor-key]") ?? null;
          }
        }
      }
      const floor = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
      if (scrollport.scrollTop <= 1) return 0;
      if (floor - scrollport.scrollTop <= 1) return itemKeys.length - 1;
      const readingLine = rect.top + (bottom - rect.top) * 0.25;
      let fallback = current;
      for (let index = 0; index < itemKeys.length; index += 1) {
        const row = anchors.get(itemKeys[index]);
        if (row === undefined) continue;
        if (row.getBoundingClientRect().top > readingLine) break;
        fallback = index;
      }
      return fallback;
    }

    function MessageNavigator({ useSession, loadOlder, t }) {
      const order = useSession(snapshot => snapshot.chat.order);
      const nodeStore = useSession(snapshot => snapshot.chat.nodes);
      const openState = useSession(snapshot => snapshot.openState);
      const hasMore = useSession(snapshot => snapshot.hasMore);
      const loadingOlder = useSession(snapshot => snapshot.loadingOlder);
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
      const eventSpan = useMemo(
        () => loadedEventSpan(order, nodeStore),
        [itemsRevision, order],
      );
      const orderPositions = useMemo(() => {
        const positions = new Map();
        const itemByKey = new Map(items.map((item, index) => [item.key, index]));
        let latest = 0;
        for (const key of order) {
          if (itemByKey.has(key)) latest = itemByKey.get(key);
          positions.set(key, latest);
        }
        return positions;
      }, [items, order]);
      const itemKeys = useMemo(() => items.map(item => item.key), [items]);

      const [activeKey, setActiveKey] = useState(null);
      const [layout, setLayout] = useState(null);
      const [hoveredKey, setHoveredKey] = useState(null);
      const [loadLimit, setLoadLimit] = useState(AUTO_HISTORY_EVENT_LIMIT);
      const [loadFailed, setLoadFailed] = useState(false);
      const [retryRevision, setRetryRevision] = useState(0);
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
      const active = useMemo(() => {
        const index = items.findIndex(item => item.key === activeKey);
        return index < 0 ? 0 : index;
      }, [activeKey, items]);

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

        const update = () => {
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
          };
          setLayout(previous => (
            previous?.top === next.top &&
            previous?.left === next.left &&
            previous?.height === next.height
              ? previous
              : next
          ));
        };

        update();
        const resize = typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(update);
        resize?.observe(scrollport);
        const composer = scrollport.querySelector("[data-composer-seat]");
        if (composer !== null) resize?.observe(composer);
        const mutation = typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(records => {
            const changedAnchors = records.some(record =>
              [...record.addedNodes, ...record.removedNodes].some(node =>
                node instanceof Element && (
                  node.matches("[data-chat-anchor-key]") ||
                  node.querySelector("[data-chat-anchor-key]") !== null
                )
              )
            );
            if (changedAnchors) update();
          });
        mutation?.observe(scrollport, { childList: true, subtree: true });
        window.addEventListener("resize", update);
        return () => {
          resize?.disconnect();
          mutation?.disconnect();
          window.removeEventListener("resize", update);
          if (scrollportRef.current === scrollport) scrollportRef.current = null;
        };
      }, [items, refreshAnchors]);

      const updateActive = useCallback(() => {
        frameRef.current = 0;
        const scrollport = scrollportRef.current;
        if (scrollport === null || orderPositions.size === 0) return;
        setActiveKey(currentKey => {
          const current = Math.max(0, items.findIndex(item => item.key === currentKey));
          const next = activeFromReadingLine(
            scrollport,
            orderPositions,
            itemKeys,
            anchorsRef.current,
            current,
          );
          return items[next]?.key ?? currentKey;
        });
      }, [itemKeys, items, orderPositions]);

      useEffect(() => {
        const scrollport = scrollportRef.current;
        if (scrollport === null || layout === null) return undefined;
        const schedule = () => {
          if (frameRef.current === 0) frameRef.current = requestAnimationFrame(updateActive);
        };
        schedule();
        scrollport.addEventListener("scroll", schedule, { passive: true });
        return () => {
          scrollport.removeEventListener("scroll", schedule);
          if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current);
          frameRef.current = 0;
        };
      }, [layout, updateActive]);

      useEffect(() => {
        const currentKey = items[active]?.key;
        if (currentKey === undefined || currentKey === previousActiveRef.current) return;
        previousActiveRef.current = currentKey;
        if (pointerInsideRef.current || Date.now() < manualUntilRef.current) return;
        const list = railRef.current;
        const button = buttonsRef.current.get(currentKey);
        if (list === null || button === undefined) return;
        const target = button.offsetTop - (list.clientHeight - button.offsetHeight) / 2;
        list.scrollTo({
          top: Math.max(0, target),
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }, [active, items]);

      useEffect(() => {
        if (
          openState !== "open" ||
          loadFailed ||
          requestInFlightRef.current ||
          !shouldAutoLoad({
            loadedEvents: eventSpan,
            hasMore,
            loading: loadingOlder,
            limit: loadLimit,
          })
        ) return;
        requestInFlightRef.current = true;
        void loadPage().then(result => {
          if (mountedRef.current && result === "failed") setLoadFailed(true);
        }).catch(() => {
          if (mountedRef.current) setLoadFailed(true);
        }).finally(() => {
          requestInFlightRef.current = false;
          if (mountedRef.current) setRetryRevision(value => value + 1);
        });
      }, [
        eventSpan,
        hasMore,
        loadFailed,
        loadLimit,
        loadPage,
        loadingOlder,
        openState,
        retryRevision,
      ]);

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
        setActiveKey(item.key);
        const viewport = scrollport.getBoundingClientRect();
        const bottom = visibleBottom(scrollport);
        const target = scrollport.scrollTop
          + row.getBoundingClientRect().top
          - viewport.top
          - (bottom - viewport.top) * 0.2;
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
          { className: "mn-status", title: label, "aria-label": label },
          items.length > 99 ? "99+" : items.length,
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
            setRetryRevision(value => value + 1);
          },
        }, "!");
      } else if (hasMore && eventSpan >= loadLimit) {
        const label = t("rail.continue");
        status = h("button", {
          type: "button",
          className: "mn-status",
          title: label,
          "aria-label": label,
          onClick: () => setLoadLimit(value => value + AUTO_HISTORY_EVENT_LIMIT),
        }, "↑");
      }

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
              left: Math.max(8, layout.left - 328),
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
            className: "mn-root",
            style: { top: layout.top, left: layout.left, height: layout.height },
          },
          h(
            "nav",
            {
              className: "mn-rail",
              "aria-label": t("rail.label"),
              onPointerEnter,
              onPointerLeave,
              onWheel,
            },
            h(
              "div",
              { className: "mn-list", ref: railRef },
              status,
              items.map((item, index) => {
                const label = item.steering
                  ? t("rail.steering", { turn: item.turn })
                  : t("rail.turn", { turn: item.turn });
                return h(
                  "button",
                  {
                    type: "button",
                    key: item.key,
                    ref: element => {
                      if (element === null) buttonsRef.current.delete(item.key);
                      else buttonsRef.current.set(item.key, element);
                    },
                    className: [
                      "mn-item",
                      item.steering ? "mn-itemSteering" : "",
                      active === index ? "mn-itemActive" : "",
                    ].filter(Boolean).join(" "),
                    "aria-label": label,
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
                );
              }),
            ),
          ),
          tooltip,
        ),
        document.body,
      );
    }

    Object.defineProperty(exports, "__test", {
      value: {
        activeIndexAtReadingLine,
        buildNavigationItems,
        contentPreview,
        loadPagePreservingPosition,
        loadedEventSpan,
        railWheel,
        restoredScrollTop,
        shouldAutoLoad,
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
