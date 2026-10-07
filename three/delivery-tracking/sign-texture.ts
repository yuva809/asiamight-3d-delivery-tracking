"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

export interface SignTextureOptions {
  title: string;
  subtitle?: string;
  background: string;
  foreground: string;
  /** Pixel size of the backing canvas. Keep power-of-two-ish and small. */
  width?: number;
  height?: number;
  /** Draw the AsiaMight mark (rounded square with an "A") before the title. */
  mark?: boolean;
  markColor?: string;
  align?: "center" | "left";
}

function fontFamily(variable: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function draw(canvas: HTMLCanvasElement, o: Required<Omit<SignTextureOptions, "subtitle">> & { subtitle?: string }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, w, h);

  const display = fontFamily("--font-display", "system-ui, sans-serif");
  const body = fontFamily("--font-body", "system-ui, sans-serif");

  const titleSize = Math.round(h * (o.subtitle ? 0.42 : 0.52));
  const subSize = Math.round(h * 0.16);
  ctx.font = `700 ${titleSize}px ${display}`;
  const titleWidth = ctx.measureText(o.title).width;

  const markSize = o.mark ? Math.round(h * (o.subtitle ? 0.5 : 0.56)) : 0;
  const gap = o.mark ? Math.round(h * 0.14) : 0;
  const blockWidth = markSize + gap + titleWidth;
  const startX = o.align === "left" ? h * 0.3 : (w - blockWidth) / 2;
  const titleY = o.subtitle ? h * 0.47 : h * 0.54;

  if (o.mark) {
    const mx = startX;
    const my = titleY - markSize / 2 - h * 0.02;
    const r = markSize * 0.24;
    ctx.fillStyle = o.markColor;
    ctx.beginPath();
    ctx.roundRect(mx, my, markSize, markSize, r);
    ctx.fill();
    ctx.fillStyle = o.background;
    ctx.font = `800 ${Math.round(markSize * 0.66)}px ${display}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("A", mx + markSize / 2, my + markSize * 0.54);
  }

  ctx.fillStyle = o.foreground;
  ctx.font = `700 ${titleSize}px ${display}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(o.title, startX + markSize + gap, titleY);

  if (o.subtitle) {
    ctx.globalAlpha = 0.82;
    ctx.font = `700 ${subSize}px ${body}`;
    ctx.letterSpacing = `${Math.round(subSize * 0.22)}px`;
    const subX = o.align === "left" ? startX + markSize + gap : w / 2;
    ctx.textAlign = o.align === "left" ? "left" : "center";
    ctx.fillText(o.subtitle.toUpperCase(), subX, h * 0.8);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
  }
}

/**
 * Builds a small CanvasTexture for signage (warehouse fascia, van livery,
 * branch signs). Avoids pulling a 3D font or a remote font file at runtime,
 * and re-draws once web fonts finish loading.
 */
export function useSignTexture(options: SignTextureOptions): THREE.CanvasTexture {
  const {
    title,
    subtitle,
    background,
    foreground,
    width = 1024,
    height = 256,
    mark = false,
    markColor = foreground,
    align = "center",
  } = options;

  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const opts = { title, subtitle, background, foreground, width, height, mark, markColor, align };
    draw(canvas, opts);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData.redraw = () => {
      draw(canvas, opts);
      tex.needsUpdate = true;
    };
    return tex;
  }, [title, subtitle, background, foreground, width, height, mark, markColor, align]);

  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) texture.userData.redraw?.();
    });
    return () => {
      cancelled = true;
      texture.dispose();
    };
  }, [texture]);

  return texture;
}
