import { spawn } from "node:child_process";

// Fixed script: the text arrives on standard input (base64), so it is never part of a command.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female)
$audio = New-Object IO.MemoryStream
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$voice.SetOutputToAudioStream($audio, $format)
$voice.Speak($text)
$voice.Dispose()
$bytes = $audio.ToArray()
$out = [Console]::OpenStandardOutput()
$out.Write($bytes, 0, $bytes.Length)
$out.Flush()
`;

/** The voice built into Windows, as raw 16 kHz PCM. Nothing leaves the computer, and no key is needed. */
export function windowsSpeech(text: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array> | null> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      signal,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const parts: Uint8Array[] = [];
    child.stdout.on("data", (part: Uint8Array) => parts.push(part));
    child.on("error", reject);
    child.on("close", (code) => {
      const audio = new Blob(parts as BlobPart[]);
      resolve(code === 0 && audio.size ? audio.stream() : null);
    });
    child.stdin.on("error", () => {
      /* The process ended early: "close" reports it. */
    });
    child.stdin.end(Buffer.from(text, "utf8").toString("base64"));
  });
}
