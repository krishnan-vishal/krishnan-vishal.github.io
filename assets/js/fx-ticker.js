/*=====================================================
  GLOBAL ANNOUNCEMENTS TICKER
  Duplicates the ticker cards once so the CSS marquee
  (translateX 0 -> -50%) loops seamlessly.
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    const track = document.getElementById("announcementTicker");

    if (!track) return;

    const originalHTML = track.innerHTML;

    track.innerHTML = originalHTML + originalHTML;

});
