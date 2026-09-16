(() => {
  const background = document.querySelector(".side-background");
  if (!background) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wideScreen = window.matchMedia("(min-width: 1101px)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const pointer = { x: 0, y: 0, active: false };
  const rails = [...background.children].map(element => ({ element, left: 0, width: 0 }));
  // A quiet arrangement of spheres, raised tiles and slender horizontal bars.
  const composition = [
    ["sphere", .26, .13, 88, 88],
    ["bar", .73, .24, 136, 15],
    ["block", .32, .39, 65, 76],
    ["sphere", .79, .47, 36, 36],
    ["bar", .18, .57, 112, 12],
    ["sphere", .56, .73, 69, 69],
    ["block", .81, .87, 45, 49],
    ["sphere", .15, .95, 29, 29],
    ["bar", .65, .06, 86, 9],
    ["sphere", .91, .32, 25, 25],
    ["bar", .47, .91, 144, 16],
    ["block", .05, .79, 33, 41]
  ];
  const shapes = rails.flatMap((rail, side) => composition.map(([kind, x, y, width, height], index) => {
    const element = document.createElement("span");
    element.className = `ambient-shape ambient-shape--${kind}`;
    element.style.setProperty("--shape-opacity", String(.58 + (index % 3) * .09));
    rail.element.append(element);
    return {
      element, rail, width, height,
      startX: side ? 1 - x : x,
      startY: (y + side * .16) % 1,
      speed: 4 + (index % 4) * .7,
      x: 0, y: 0, offsetX: 0, offsetY: 0, scale: 1
    };
  }));

  let viewportHeight = 0;
  let frame = 0;
  let previousTime = 0;
  let pageActive = true;

  function paint(delta) {
    const easing = 1 - Math.exp(-delta * 7);
    for (const shape of shapes) {
      const { rail } = shape;
      // Wrap only outside the clipped rail, so the diagonal drift is continuous.
      shape.x += delta * shape.speed * .65;
      shape.y -= delta * shape.speed;
      if (shape.x > rail.width + 180) shape.x = -180;
      if (shape.y < -180) shape.y = viewportHeight + 180;

      let targetX = 0;
      let targetY = 0;
      if (pointer.active && !reducedMotion.matches &&
          pointer.x >= rail.left && pointer.x <= rail.left + rail.width) {
        const dx = rail.left + shape.x - pointer.x;
        const dy = shape.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const radius = 160;
        if (distance < radius) {
          const force = 32 * (1 - distance / radius) ** 2;
          targetX = (distance > 0 ? dx / distance : 1) * force;
          targetY = (distance > 0 ? dy / distance : 0) * force;
        }
      }
      shape.offsetX += (targetX - shape.offsetX) * easing;
      shape.offsetY += (targetY - shape.offsetY) * easing;
      const x = shape.x - shape.width * shape.scale / 2 + shape.offsetX;
      const y = shape.y - shape.height * shape.scale / 2 + shape.offsetY;
      shape.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    }
  }

  function animate(time) {
    if (!previousTime) previousTime = time;
    const elapsed = time - previousTime;
    // 30fps is enough for the slow drift and keeps this decoration inexpensive.
    if (elapsed >= 1000 / 30) {
      paint(Math.min(elapsed / 1000, .1));
      previousTime = time;
    }
    frame = requestAnimationFrame(animate);
  }

  function syncAnimation() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (reducedMotion.matches) {
      for (const shape of shapes) shape.offsetX = shape.offsetY = 0;
      paint(0);
    }
    if (pageActive && !document.hidden && wideScreen.matches && !reducedMotion.matches) {
      frame = requestAnimationFrame(animate);
    }
  }

  function resize() {
    viewportHeight = window.innerHeight;
    pointer.active = false;
    for (const rail of rails) {
      const rect = rail.element.getBoundingClientRect();
      rail.left = rect.left;
      rail.width = rect.width;
    }
    for (const shape of shapes) {
      shape.scale = Math.max(.65, Math.min(1.15, shape.rail.width / 220));
      shape.x = shape.startX * shape.rail.width;
      shape.y = shape.startY * viewportHeight;
      shape.offsetX = shape.offsetY = 0;
      shape.element.style.setProperty("--shape-width", `${shape.width * shape.scale}px`);
      shape.element.style.setProperty("--shape-height", `${shape.height * shape.scale}px`);
    }
    paint(0);
    syncAnimation();
  }

  window.addEventListener("pointermove", event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = finePointer.matches && event.pointerType !== "touch" &&
      event.clientY > 64 && !document.querySelector("dialog[open]");
  }, { passive: true });
  const clearPointer = () => { pointer.active = false; };
  document.documentElement.addEventListener("pointerleave", clearPointer);
  window.addEventListener("blur", clearPointer);
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    clearPointer();
    syncAnimation();
  });
  window.addEventListener("pagehide", () => { pageActive = false; syncAnimation(); });
  window.addEventListener("pageshow", () => { pageActive = true; resize(); });
  reducedMotion.addEventListener("change", syncAnimation);
  wideScreen.addEventListener("change", resize);
  finePointer.addEventListener("change", clearPointer);
  resize();
})();
