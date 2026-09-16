import { LoaderCircle, Move, X } from 'lucide-react';
import { PointerEvent, useEffect, useRef, useState } from 'react';

const OUTPUT_SIZE = 512;

type Point = { x: number; y: number };

export function AvatarCropDialog({
  file,
  busy,
  onCancel,
  onSave,
}: {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; point: Point } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  const constrain = (next: Point, nextZoom = zoom): Point => {
    const image = imageRef.current;
    if (!image) return next;
    const baseScale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight);
    const width = image.naturalWidth * baseScale * nextZoom;
    const height = image.naturalHeight * baseScale * nextZoom;
    return {
      x: Math.max((OUTPUT_SIZE - width) / 2, Math.min((width - OUTPUT_SIZE) / 2, next.x)),
      y: Math.max((OUTPUT_SIZE - height) / 2, Math.min((height - OUTPUT_SIZE) / 2, next.y)),
    };
  };

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setReady(true);
    };
    image.src = objectUrl;
    return () => {
      URL.revokeObjectURL(objectUrl);
      imageRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const baseScale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(image, (OUTPUT_SIZE - width) / 2 + offset.x, (OUTPUT_SIZE - height) / 2 + offset.y, width, height);
  }, [offset, ready, zoom]);

  const changeZoom = (nextZoom: number) => {
    setZoom(nextZoom);
    setOffset((current) => constrain(current, nextZoom));
  };

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY } };
  };

  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const ratio = OUTPUT_SIZE / event.currentTarget.getBoundingClientRect().width;
    const delta = { x: (event.clientX - drag.point.x) * ratio, y: (event.clientY - drag.point.y) * ratio };
    dragRef.current = { ...drag, point: { x: event.clientX, y: event.clientY } };
    setOffset((current) => constrain({ x: current.x + delta.x, y: current.y + delta.y }));
  };

  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const save = () => {
    if (!ready || busy) return;
    canvasRef.current?.toBlob((blob) => blob && onSave(blob), 'image/jpeg', 0.9);
  };

  return (
    <div className="avatar-crop-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
        <header>
          <div><h2 id="avatar-crop-title">Căn chỉnh ảnh đại diện</h2><p>Kéo ảnh để chọn vùng hiển thị, dùng thanh trượt để phóng to.</p></div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Đóng"><X /></button>
        </header>
        <div className="avatar-crop-stage">
          <canvas
            ref={canvasRef}
            width={OUTPUT_SIZE}
            height={OUTPUT_SIZE}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            aria-label="Kéo để căn chỉnh ảnh đại diện"
          />
          {!ready && <LoaderCircle className="spin avatar-crop-loader" />}
        </div>
        <label className="avatar-zoom"><Move /><span>Thu phóng</span><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} disabled={busy || !ready} /></label>
        <footer>
          <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="button" className="primary-btn" onClick={save} disabled={busy || !ready}>{busy && <LoaderCircle className="spin" />} Cập nhật</button>
        </footer>
      </section>
    </div>
  );
}
