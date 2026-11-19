/**
 * OBSIDIAN GT — CINEMATIC SCROLL ANIMATION ENGINE
 * High-performance HTML5 Canvas image sequence with physics LERP damping
 */

(function () {
  'use strict';

  // --- CONFIGURATION ---
  const FRAME_COUNT = 118;
  const FRAME_PATH = (index) => `frames/ezgif-frame-${String(index).padStart(3, '0')}.jpg`;

  // --- DOM ELEMENTS ---
  const preloader = document.getElementById('preloader');
  const loaderPercent = document.getElementById('loader-percent');
  const ringProgress = document.getElementById('ring-progress');
  const statusFill = document.getElementById('status-fill');
  const loaderFramesCount = document.getElementById('loader-frames-count');

  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const scrollTrack = document.getElementById('scroll-track');

  const hudFrameNumber = document.getElementById('hud-frame-number');
  const btnAutoplay = document.getElementById('btn-autoplay');
  const autoplayText = document.getElementById('autoplay-text');
  const btnAudio = document.getElementById('btn-audio');
  const audioText = document.getElementById('audio-text');
  const btnSmoothness = document.getElementById('btn-smoothness');
  const smoothnessText = document.getElementById('smoothness-text');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  const scrubToggleBtn = document.getElementById('scrub-toggle-btn');
  const frameRange = document.getElementById('frame-range');
  const sliderGlow = document.getElementById('slider-glow');
  const timelineProgressText = document.getElementById('timeline-progress-text');
  const speedChips = document.querySelectorAll('.speed-chip');
  const btnReplay = document.getElementById('btn-replay');

  // Story sections with precise fade windows
  const storySections = [
    { el: document.getElementById('step-1'), inStart: 0.0, inEnd: 0.0, outStart: 0.12, outEnd: 0.20 },
    { el: document.getElementById('step-2'), inStart: 0.22, inEnd: 0.30, outStart: 0.42, outEnd: 0.50 },
    { el: document.getElementById('step-3'), inStart: 0.52, inEnd: 0.60, outStart: 0.72, outEnd: 0.80 },
    { el: document.getElementById('step-4'), inStart: 0.82, inEnd: 0.90, outStart: 1.0,  outEnd: 1.0 }
  ];

  // --- ENGINE STATE ---
  const images = new Array(FRAME_COUNT);
  let loadedCount = 0;
  let targetProgress = 0;
  let currentProgress = 0;
  let lerpFactor = 0.08; // Buttery smooth default
  let renderedFrameIndex = -1;
  let isPlaying = false;
  let playSpeed = 1.0;
  let isDraggingSlider = false;
  let isAudioEnabled = false;
  let audioCtx = null;
  let synthNodes = null;

  // 60 FPS Throttling
  const TARGET_FPS = 60;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let lastFrameTime = 0;

  // --- INITIALIZATION & PRELOADING ---
  function init() {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    window.addEventListener('orientationchange', () => {
      setTimeout(setupCanvas, 150);
    });
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', () => {
        setTimeout(setupCanvas, 150);
      });
    }
    loadAllFrames();
    bindEvents();
    requestAnimationFrame(renderLoop);
  }

  function setupCanvas() {
    const isMobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (renderedFrameIndex >= 0) {
      drawFrame(renderedFrameIndex);
    }
  }

  // --- PROGRESSIVE STREAMING FRAME LOADER ---
  function loadAllFrames() {
    const ringCircumference = 2 * Math.PI * 52;
    const isMobile = window.innerWidth < 768;
    const MIN_INTERACTIVE_FRAMES = isMobile ? 16 : 24;

    // Create priority load order: Keyframes first, then in-between frames
    const priorityIndices = [];
    const secondaryIndices = [];

    // First 8 frames are critical for initial scroll feel
    for (let i = 1; i <= 8; i++) {
      priorityIndices.push(i);
    }

    // Keyframe stride (every 3rd frame)
    for (let i = 9; i <= FRAME_COUNT; i++) {
      if (i % 3 === 0 || i === FRAME_COUNT) {
        priorityIndices.push(i);
      } else {
        secondaryIndices.push(i);
      }
    }

    let isSiteUnlocked = false;

    // Safety timeout: Never keep mobile users stuck on preloader
    setTimeout(() => {
      if (!isSiteUnlocked && loadedCount >= 8) {
        completeLoading();
        isSiteUnlocked = true;
      }
    }, 3200);

    // Skip / Enter button hook
    const skipBtn = document.getElementById('btn-skip-loader');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        if (!isSiteUnlocked) {
          completeLoading();
          isSiteUnlocked = true;
        }
      });
    }

    function fetchFrame(frameNum, isPriority) {
      const img = new Image();
      const index = frameNum - 1;

      img.onload = () => {
        images[index] = img;
        loadedCount++;
        const percent = Math.min(100, Math.round((loadedCount / FRAME_COUNT) * 100));

        // Update preloader UI
        if (loaderPercent) loaderPercent.textContent = `${percent}%`;
        if (loaderFramesCount) loaderFramesCount.textContent = `Streaming ${loadedCount} / ${FRAME_COUNT} frames`;
        if (statusFill) statusFill.style.width = `${percent}%`;

        if (ringProgress) {
          const offset = ringCircumference - (percent / 100) * ringCircumference;
          ringProgress.style.strokeDashoffset = offset;
        }

        // Show skip/start button once initial batch is ready
        if (skipBtn && loadedCount >= 12) {
          skipBtn.style.display = 'inline-flex';
        }

        // Draw initial frame as soon as frame 1 arrives
        if (index === 0 && renderedFrameIndex === -1) {
          drawFrame(0);
        }

        // Fast mobile start: Unlock as soon as minimum interactive set is buffered
        if (!isSiteUnlocked && loadedCount >= MIN_INTERACTIVE_FRAMES) {
          completeLoading();
          isSiteUnlocked = true;
        }
      };

      img.onerror = () => {
        loadedCount++;
      };

      img.src = FRAME_PATH(frameNum);
    }

    // Step 1: Load priority keyframes immediately
    priorityIndices.forEach((num) => fetchFrame(num, true));

    // Step 2: Stream secondary in-between frames with slight delay to prevent mobile socket congestion
    setTimeout(() => {
      secondaryIndices.forEach((num) => fetchFrame(num, false));
    }, isMobile ? 350 : 150);
  }

  function completeLoading() {
    setTimeout(() => {
      if (preloader) preloader.classList.add('fade-out');
      document.body.classList.remove('loading');
      drawFrame(0);
      updateScrollerProgress();

      // Fade orientation banner after 4.5s
      const orientationBanner = document.getElementById('orientation-banner');
      if (orientationBanner) {
        setTimeout(() => {
          orientationBanner.style.opacity = '0';
          setTimeout(() => orientationBanner.remove(), 600);
        }, 4500);
      }
    }, 250);
  }

  // Find nearest loaded frame so canvas never flickers or goes blank on mobile
  function getNearestLoadedImage(targetIdx) {
    if (images[targetIdx] && images[targetIdx].complete && images[targetIdx].naturalWidth > 0) {
      return images[targetIdx];
    }
    for (let offset = 1; offset < FRAME_COUNT; offset++) {
      const prev = targetIdx - offset;
      if (prev >= 0 && images[prev] && images[prev].complete && images[prev].naturalWidth > 0) {
        return images[prev];
      }
      const next = targetIdx + offset;
      if (next < FRAME_COUNT && images[next] && images[next].complete && images[next].naturalWidth > 0) {
        return images[next];
      }
    }
    return null;
  }

  // --- CANVAS RENDERING (MOBILE OPTIMIZED FRAMING) ---
  function drawFrame(index) {
    const img = getNearestLoadedImage(index);
    if (!img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;

    const hRatio = canvasW / imgW;
    const vRatio = canvasH / imgH;
    const ratio = Math.max(hRatio, vRatio);

    const drawW = imgW * ratio;
    const drawH = imgH * ratio;
    const drawX = (canvasW - drawW) * 0.5;

    // In mobile portrait mode, bias vertical alignment slightly upward (0.35 instead of 0.5)
    // so the car is prominently centered in the upper 60% viewport clear of bottom HUD cards!
    const drawY = isMobilePortrait ? (canvasH - drawH) * 0.35 : (canvasH - drawH) * 0.5;

    ctx.drawImage(img, 0, 0, imgW, imgH, drawX, drawY, drawW, drawH);
    renderedFrameIndex = index;
  }

  // --- PHYSICS & RENDER LOOP (60 FPS) ---
  function renderLoop(now) {
    requestAnimationFrame(renderLoop);

    if (now && lastFrameTime) {
      const elapsed = now - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        return; // Skip tick to enforce strict 60 FPS
      }
      lastFrameTime = now - (elapsed % FRAME_INTERVAL);
    } else {
      lastFrameTime = now || performance.now();
    }

    const trackHeight = scrollTrack.offsetHeight - window.innerHeight;

    // Auto cruise playback (calibrated for 60 FPS)
    if (isPlaying) {
      targetProgress += (0.0018 * playSpeed);
      if (targetProgress > 1) {
        targetProgress = 0; // Seamless loop
      }
      if (!isDraggingSlider && trackHeight > 0) {
        window.scrollTo({
          top: targetProgress * trackHeight,
          behavior: 'instant'
        });
      }
    }

    // Physics interpolation (LERP)
    const diff = targetProgress - currentProgress;
    if (Math.abs(diff) > 0.0001) {
      currentProgress += diff * lerpFactor;
    } else {
      currentProgress = targetProgress;
    }

    const clampedProgress = Math.min(1, Math.max(0, currentProgress));
    const targetFrame = Math.min(FRAME_COUNT - 1, Math.max(0, Math.round(clampedProgress * (FRAME_COUNT - 1))));

    // Draw when frame changes
    if (targetFrame !== renderedFrameIndex) {
      drawFrame(targetFrame);
      updateHUD(targetFrame, clampedProgress);
      if (isAudioEnabled && synthNodes) {
        updateAudio(clampedProgress);
      }
    }

    // Update story sections
    updateStorySections(clampedProgress);

    requestAnimationFrame(renderLoop);
  }

  // --- STORY SECTIONS SYNCHRONIZATION ---
  function calculateOpacity(prog, s) {
    if (prog < s.inStart || prog > s.outEnd) return 0;
    if (prog >= s.inEnd && prog <= s.outStart) return 1;
    if (prog < s.inEnd) {
      return s.inEnd === s.inStart ? 1 : (prog - s.inStart) / (s.inEnd - s.inStart);
    }
    if (prog > s.outStart) {
      return s.outEnd === s.outStart ? 1 : 1 - (prog - s.outStart) / (s.outEnd - s.outStart);
    }
    return 0;
  }

  function updateStorySections(progress) {
    const trackHeight = scrollTrack.offsetHeight - window.innerHeight;
    const scrollY = window.scrollY;
    const isPastTrack = scrollY > trackHeight + 50;

    // Toggle bottom scrubber visibility when reading portfolio sections below
    const hudScrubberBar = document.getElementById('hud-scrubber-bar');
    if (hudScrubberBar) {
      if (scrollY > trackHeight + 80) {
        hudScrubberBar.classList.add('scrolled-past');
      } else {
        hudScrubberBar.classList.remove('scrolled-past');
      }
    }

    // Active nav link highlight (ScrollSpy)
    updateNavHighlight(scrollY, trackHeight);

    storySections.forEach((sec) => {
      if (!sec.el) return;

      if (isPastTrack) {
        sec.el.style.opacity = '0';
        sec.el.style.pointerEvents = 'none';
        return;
      }

      const opacity = calculateOpacity(progress, sec);

      if (opacity > 0.01) {
        sec.el.style.opacity = opacity.toFixed(3);
        const translateY = (1 - opacity) * 16;
        sec.el.style.transform = `translateY(${translateY.toFixed(1)}px)`;
        sec.el.style.pointerEvents = opacity > 0.3 ? 'auto' : 'none';
      } else {
        sec.el.style.opacity = '0';
        sec.el.style.pointerEvents = 'none';
      }
    });
  }

  function updateNavHighlight(scrollY, trackHeight) {
    const navLinks = document.querySelectorAll('.hud-nav-link');
    if (!navLinks.length) return;

    const sections = [
      { id: 'contact', el: document.getElementById('contact') },
      { id: 'credentials', el: document.getElementById('credentials') },
      { id: 'projects', el: document.getElementById('projects') },
      { id: 'telemetry', el: document.getElementById('telemetry') },
      { id: 'tech-specs', el: document.getElementById('tech-specs') }
    ];

    let currentSectionId = 'step-1';

    if (scrollY > trackHeight - 100) {
      for (const sec of sections) {
        if (sec.el) {
          const rect = sec.el.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.45) {
            currentSectionId = sec.id;
            break;
          }
        }
      }
    }

    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === `#${currentSectionId}`) {
        link.classList.add('active', 'text-white', 'bg-white/10');
        link.classList.remove('text-gray-400');
      } else {
        link.classList.remove('active', 'text-white', 'bg-white/10');
        link.classList.add('text-gray-400');
      }
    });
  }

  // --- HUD & TIMELINE UPDATES ---
  function updateHUD(frameIndex, progress) {
    const frameNumStr = String(frameIndex + 1).padStart(3, '0');
    hudFrameNumber.textContent = `${frameNumStr} / ${FRAME_COUNT}`;

    const percent = (progress * 100).toFixed(1);
    timelineProgressText.textContent = `${percent}%`;
    sliderGlow.style.width = `${percent}%`;

    if (!isDraggingSlider) {
      frameRange.value = frameIndex + 1;
    }
  }

  function updateScrollerProgress() {
    if (isPlaying) return;

    const trackHeight = scrollTrack.offsetHeight - window.innerHeight;
    if (trackHeight <= 0) return;

    const scrollY = window.scrollY;
    targetProgress = Math.min(1, Math.max(0, scrollY / trackHeight));
  }

  // --- WEB AUDIO API SYNTHESIZER ---
  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);

      // Low sub bass oscillator
      const subOsc = audioCtx.createOscillator();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(45, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, audioCtx.currentTime);
      filter.Q.setValueAtTime(4, audioCtx.currentTime);

      subOsc.connect(filter);
      filter.connect(masterGain);
      subOsc.start();

      // Ambient sine drone
      const shimmerOsc = audioCtx.createOscillator();
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(220, audioCtx.currentTime);

      const shimmerGain = audioCtx.createGain();
      shimmerGain.gain.setValueAtTime(0.04, audioCtx.currentTime);

      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(masterGain);
      shimmerOsc.start();

      synthNodes = {
        masterGain,
        subOsc,
        filter,
        shimmerOsc,
        shimmerGain
      };
    } catch (e) {
      console.warn('AudioContext unavailable:', e);
    }
  }

  function toggleAudio() {
    if (!audioCtx) {
      initAudio();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    isAudioEnabled = !isAudioEnabled;
    if (synthNodes) {
      const targetGain = isAudioEnabled ? 0.2 : 0;
      synthNodes.masterGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
    }

    btnAudio.classList.toggle('active', isAudioEnabled);
    audioText.textContent = isAudioEnabled ? 'SOUND ON' : 'SOUND OFF';
  }

  function updateAudio(progress) {
    if (!synthNodes || !audioCtx) return;

    // Filter frequency opens up with camera zoom
    const targetFreq = 120 + Math.pow(progress, 1.4) * 800;
    synthNodes.filter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.04);

    // Sub pitch raises subtly with speed
    const subFreq = 40 + progress * 25;
    synthNodes.subOsc.frequency.setTargetAtTime(subFreq, audioCtx.currentTime, 0.04);

    // Harmonic shimmer
    synthNodes.shimmerOsc.frequency.setTargetAtTime(220 + progress * 110, audioCtx.currentTime, 0.04);
  }

  // --- PLAYBACK CONTROLS ---
  function togglePlay() {
    isPlaying = !isPlaying;
    btnAutoplay.classList.toggle('active', isPlaying);
    scrubToggleBtn.classList.toggle('playing', isPlaying);
    document.body.classList.toggle('playing', isPlaying);
    autoplayText.textContent = isPlaying ? 'PAUSE' : 'CRUISE';
  }

  function toggleSmoothness() {
    if (lerpFactor === 0.08) {
      lerpFactor = 0.24;
      smoothnessText.textContent = 'DIRECT 0.24';
      btnSmoothness.classList.add('active');
    } else {
      lerpFactor = 0.08;
      smoothnessText.textContent = 'SMOOTH 0.08';
      btnSmoothness.classList.remove('active');
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // --- EVENT LISTENERS ---
  function bindEvents() {
    window.addEventListener('scroll', updateScrollerProgress, { passive: true });

    // Smooth anchor navigation pause
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', () => {
        if (isPlaying) togglePlay();
      });
    });

    frameRange.addEventListener('input', (e) => {
      isDraggingSlider = true;
      if (isPlaying) togglePlay();

      const val = parseFloat(e.target.value);
      targetProgress = (val - 1) / (FRAME_COUNT - 1);

      const trackHeight = scrollTrack.offsetHeight - window.innerHeight;
      window.scrollTo({
        top: targetProgress * trackHeight,
        behavior: 'instant'
      });
    });

    frameRange.addEventListener('change', () => {
      isDraggingSlider = false;
    });

    btnAutoplay.addEventListener('click', togglePlay);
    scrubToggleBtn.addEventListener('click', togglePlay);
    btnAudio.addEventListener('click', toggleAudio);
    btnSmoothness.addEventListener('click', toggleSmoothness);
    btnFullscreen.addEventListener('click', toggleFullscreen);

    if (btnReplay) {
      btnReplay.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        targetProgress = 0;
      });
    }

    speedChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        speedChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        playSpeed = parseFloat(chip.dataset.speed);
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        stepFrame(1);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        stepFrame(-1);
      } else if (e.code === 'KeyM') {
        toggleAudio();
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      } else if (e.code === 'Home') {
        e.preventDefault();
        jumpToProgress(0);
      } else if (e.code === 'End') {
        e.preventDefault();
        jumpToProgress(1);
      }
    });
  }

  function stepFrame(delta) {
    if (isPlaying) togglePlay();
    const currentFrame = Math.round(targetProgress * (FRAME_COUNT - 1));
    const nextFrame = Math.max(0, Math.min(FRAME_COUNT - 1, currentFrame + delta));
    jumpToProgress(nextFrame / (FRAME_COUNT - 1));
  }

  function jumpToProgress(prog) {
    targetProgress = Math.max(0, Math.min(1, prog));
    const trackHeight = scrollTrack.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: targetProgress * trackHeight,
      behavior: 'smooth'
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
