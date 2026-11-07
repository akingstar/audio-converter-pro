import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";

const ffmpeg = new FFmpeg();

const input = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const fileList = document.getElementById("fileList");
const fileCount = document.getElementById("fileCount");
const convertBtn = document.getElementById("convertBtn");
const clearBtn = document.getElementById("clearBtn");
const status = document.getElementById("status");

let files = [];
let engineReady = false;
let converting = false;

const formats = {
  mp3: { ext: "mp3", codec: "libmp3lame", container: "mp3" },
  wav: { ext: "wav", codec: "pcm_s16le", container: "wav" },
  flac: { ext: "flac", codec: "flac", container: "flac" },
  m4a: { ext: "m4a", codec: "aac", container: "ipod" },
  aac: { ext: "aac", codec: "aac", container: "adts" },
  ogg: { ext: "ogg", codec: "libvorbis", container: "ogg" },
  opus: { ext: "opus", codec: "libopus", container: "ogg" },
  aiff: { ext: "aiff", codec: "pcm_s16be", container: "aiff" }
};

function setStatus(message) {
  status.textContent = message;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function safeName(name) {
  return name.replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 70) || "audio";
}

function renderFiles() {
  fileCount.textContent = `(${files.length})`;
  convertBtn.disabled = files.length === 0 || converting;

  if (!files.length) {
    fileList.innerHTML = '<div class="empty">Your selected audio files will appear here.</div>';
    return;
  }

  fileList.innerHTML = "";

  files.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "file-row";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = item.file.name;

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = `${formatSize(item.file.size)} · ${item.state}`;

    const progress = document.createElement("div");
    progress.className = "progress";

    const bar = document.createElement("span");
    bar.style.width = item.progress + "%";
    progress.appendChild(bar);

    const details = document.createElement("div");
    details.className = "file-progress";
    details.textContent = item.message || "";

    row.append(name, info, progress, details);

    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.download = item.outputName;
      link.textContent = "Download converted file";
      link.style.cssText = "display:inline-block;margin-top:12px;color:#b4aaff;font-size:13px;";
      row.appendChild(link);
    }

    if (!converting) {
      const remove = document.createElement("button");
      remove.className = "text-button";
      remove.textContent = "Remove";
      remove.style.marginTop = "10px";
      remove.onclick = () => {
        if (item.url) URL.revokeObjectURL(item.url);
        files.splice(index, 1);
        renderFiles();
      };
      row.appendChild(remove);
    }

    fileList.appendChild(row);
  });
}

function addFiles(selected) {
  const valid = Array.from(selected).filter(file =>
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff|aif|wma)$/i.test(file.name)
  );

  valid.forEach(file => {
    files.push({
      file,
      state: "Waiting",
      progress: 0,
      message: "",
      url: null,
      outputName: ""
    });
  });

  if (selected.length !== valid.length) {
    setStatus("Some unsupported files were skipped.");
  } else {
    setStatus(`${valid.length} file(s) added.`);
  }

  renderFiles();
  input.value = "";
}

input.addEventListener("change", event => addFiles(event.target.files));

dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  dropZone.style.borderColor = "#8b7cff";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.borderColor = "#414c64";
});

dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.style.borderColor = "#414c64";
  addFiles(event.dataTransfer.files);
});

clearBtn.addEventListener("click", () => {
  if (converting) return;
  files.forEach(item => {
    if (item.url) URL.revokeObjectURL(item.url);
  });
  files = [];
  renderFiles();
  setStatus("File list cleared.");
});

async function loadEngine() {
  if (engineReady) return;

  setStatus("Loading audio conversion engine. Please wait...");

  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    classWorkerURL: new URL("./vendor/ffmpeg/worker.js", import.meta.url).href
  });

  engineReady = true;
}

async function convertOne(item, index) {
  const format = formats[document.getElementById("format").value];
  const bitrate = document.getElementById("bitrate").value;
  const sampleRate = document.getElementById("sampleRate").value;
  const channels = document.getElementById("channels").value;
  const normalize = document.getElementById("normalize").checked;

  const inputName = `input_${index}_${Date.now()}`;
  const outputName = `${safeName(item.file.name)}_converted.${format.ext}`;

  item.state = "Converting";
  item.progress = 10;
  item.message = "Preparing audio...";
  renderFiles();

  await ffmpeg.writeFile(inputName, await fetchFile(item.file));

  const args = ["-i", inputName, "-vn"];

  if (normalize) {
    args.push("-af", "loudnorm");
  }

  args.push(
    "-ar", sampleRate,
    "-ac", channels,
    "-c:a", format.codec
  );

  if (!["wav", "flac", "aiff"].includes(format.ext)) {
    args.push("-b:a", bitrate);
  }

  args.push("-f", format.container, outputName);

  const exitCode = await ffmpeg.exec(args);

  if (exitCode !== 0) {
    throw new Error("FFmpeg could not convert this file.");
  }

  const data = await ffmpeg.readFile(outputName);
  const mime = format.ext === "m4a" ? "audio/mp4" :
    format.ext === "aac" ? "audio/aac" :
    format.ext === "wav" ? "audio/wav" :
    format.ext === "flac" ? "audio/flac" :
    format.ext === "ogg" ? "audio/ogg" :
    format.ext === "opus" ? "audio/ogg" :
    format.ext === "aiff" ? "audio/aiff" : "audio/mpeg";

  item.url = URL.createObjectURL(new Blob([data.buffer], { type: mime }));
  item.outputName = outputName;
  item.state = "Completed";
  item.progress = 100;
  item.message = "Conversion successful.";

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
}

convertBtn.addEventListener("click", async () => {
  if (converting || !files.length) return;

  converting = true;
  renderFiles();

  try {
    await loadEngine();

    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];

      if (item.state === "Completed") continue;

      try {
        setStatus(`Converting ${i + 1} of ${files.length}...`);
        await convertOne(item, i);
        success++;
      } catch (error) {
        console.error(error);
        item.state = "Failed";
        item.message = error.message || "Conversion failed.";
        failed++;
      }

      renderFiles();
    }

    setStatus(`Finished: ${success} successful, ${failed} failed.`);
  } catch (error) {
    console.error(error);
    setStatus("Engine loading failed: " + (error?.message || String(error)));
  } finally {
    converting = false;
    renderFiles();
  }
});

renderFiles();
