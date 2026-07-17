// Seek `.carousel-still` <video> elements to a fixed frame (no playback).
export function seekStills(root = document) {
  root.querySelectorAll('.carousel-still').forEach((vid) => {
    vid.addEventListener('loadedmetadata', () => {
      vid.currentTime = 3;
    });
    if (vid.readyState >= 1) vid.currentTime = 3;
  });
}
