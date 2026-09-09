const WINDOW_LAYOUT_EVENTS = [
  'maximize',
  'move',
  'resize',
  'restore',
  'show',
  'unmaximize',
];

export class WindowSurface {
  #desiredSurface = 'status';
  #disposed = false;
  #layoutScheduled = false;
  #mainWindow;
  #onError;
  #requestLayout;
  #schedule;
  #screen;
  #toolbarHeight;
  #view;

  constructor({
    mainWindow,
    onError = () => {},
    schedule = setImmediate,
    screen,
    toolbarHeight,
    view,
  }) {
    this.#mainWindow = mainWindow;
    this.#onError = onError;
    this.#schedule = schedule;
    this.#screen = screen;
    this.#toolbarHeight = toolbarHeight;
    this.#view = view;
    this.#requestLayout = () => this.#scheduleLayout();

    for (const event of WINDOW_LAYOUT_EVENTS) {
      mainWindow.on(event, this.#requestLayout);
    }
    screen?.on('display-added', this.#requestLayout);
    screen?.on('display-metrics-changed', this.#requestLayout);
    screen?.on('display-removed', this.#requestLayout);
  }

  get showingDsh() {
    return this.#desiredSurface === 'dsh';
  }

  showDsh() {
    this.#desiredSurface = 'dsh';
    this.#scheduleLayout();
  }

  showStatus() {
    this.#desiredSurface = 'status';
    this.#scheduleLayout();
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const event of WINDOW_LAYOUT_EVENTS) {
      this.#mainWindow.off(event, this.#requestLayout);
    }
    this.#screen?.off('display-added', this.#requestLayout);
    this.#screen?.off('display-metrics-changed', this.#requestLayout);
    this.#screen?.off('display-removed', this.#requestLayout);
  }

  #isAttached() {
    return this.#mainWindow.contentView.children.includes(this.#view);
  }

  #reconcile() {
    if (
      this.#disposed
      || this.#mainWindow.isDestroyed()
    ) {
      return;
    }

    if (this.#desiredSurface === 'status') {
      if (this.#isAttached()) {
        this.#mainWindow.contentView.removeChildView(this.#view);
      }
      return;
    }

    if (
      this.#mainWindow.isMinimized()
      || !this.#mainWindow.isVisible()
    ) {
      return;
    }
    const { width, height } = this.#mainWindow.getContentBounds();
    if (width <= 0 || height <= this.#toolbarHeight) return;

    try {
      if (!this.#isAttached()) {
        this.#mainWindow.contentView.addChildView(this.#view);
      }
      this.#view.setBounds({
        x: 0,
        y: this.#toolbarHeight,
        width,
        height: height - this.#toolbarHeight,
      });
    } catch (error) {
      this.#onError(error);
    }
  }

  #scheduleLayout() {
    if (this.#disposed || this.#layoutScheduled) return;
    this.#layoutScheduled = true;
    this.#schedule(() => {
      this.#layoutScheduled = false;
      this.#reconcile();
    });
  }
}
