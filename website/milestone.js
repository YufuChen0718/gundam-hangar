/* Gundam Hangar — milestone page interactions.
   Vanilla JS, no libraries: before/after sliders and a figure lightbox. */
(function () {
  "use strict";

  /* Before/after comparison slider ------------------------------------- */
  function setupCompare(figure) {
    var frame = figure.querySelector(".compare-frame");
    var range = figure.querySelector(".compare-range");
    if (!frame || !range) return;

    var pos = 50;
    var dragging = false;
    var moved = false;
    var startX = 0;

    function setPos(value) {
      pos = Math.max(0, Math.min(100, value));
      frame.style.setProperty("--pos", pos + "%");
      range.value = String(Math.round(pos));
    }

    function posFromClientX(clientX) {
      var rect = frame.getBoundingClientRect();
      if (!rect.width) return pos;
      return ((clientX - rect.left) / rect.width) * 100;
    }

    setPos(50);
    frame.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
    range.addEventListener("input", function () {
      setPos(Number(range.value));
    });
    range.addEventListener("focus", function () {
      figure.classList.add("is-focused");
    });
    range.addEventListener("blur", function () {
      figure.classList.remove("is-focused");
    });

    frame.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      /* Focus the slider so the arrow keys work. Capture starts on the first
         move, so a plain click still reaches the image button. */
      range.focus({ preventScroll: true });
    });

    frame.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      if (!moved && Math.abs(event.clientX - startX) > 4) {
        moved = true;
        if (frame.setPointerCapture) {
          try {
            frame.setPointerCapture(event.pointerId);
          } catch (err) {
            /* pointer capture is optional */
          }
        }
      }
      if (moved) setPos(posFromClientX(event.clientX));
    });

    function endDrag() {
      dragging = false;
    }
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);

    /* A drag ends with a click; do not also open the lightbox. */
    frame.addEventListener(
      "click",
      function (event) {
        if (moved) {
          event.preventDefault();
          event.stopPropagation();
          moved = false;
        }
      },
      true
    );
  }

  document.querySelectorAll(".compare").forEach(setupCompare);

  /* Lightbox ------------------------------------------------------------ */
  var lightbox = null;
  var closeButton = null;
  var lightboxImage = null;
  var lightboxCaption = null;
  var lastFocus = null;

  function buildLightbox() {
    lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.hidden = true;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Enlarged figure");
    lightbox.innerHTML =
      '<button type="button" class="lightbox-close">Close</button>' +
      '<img alt="">' +
      '<p class="lightbox-caption"></p>';
    document.body.appendChild(lightbox);

    closeButton = lightbox.querySelector(".lightbox-close");
    lightboxImage = lightbox.querySelector("img");
    lightboxCaption = lightbox.querySelector(".lightbox-caption");

    closeButton.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });
  }

  function openLightbox(image, captionNode) {
    if (!lightbox) buildLightbox();

    var caption = "";
    if (captionNode) {
      var clone = captionNode.cloneNode(true);
      clone.querySelectorAll(".hint").forEach(function (node) {
        node.remove();
      });
      caption = clone.textContent.replace(/\s+/g, " ").trim();
    }

    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "";
    lightboxCaption.textContent = caption;
    lightbox.hidden = false;
    document.body.classList.add("has-lightbox");
    lastFocus = document.activeElement;
    closeButton.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("has-lightbox");
    lightboxImage.removeAttribute("src");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest ? event.target.closest(".shot") : null;
    if (!trigger) return;
    var image = trigger.querySelector("img");
    if (!image) return;
    var figure = trigger.closest("figure");
    openLightbox(image, figure ? figure.querySelector("figcaption") : null);
  });

  document.addEventListener("keydown", function (event) {
    if (!lightbox || lightbox.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === "Tab") {
      /* The close button is the only focusable control in the dialog. */
      event.preventDefault();
      closeButton.focus();
    }
  });
})();
