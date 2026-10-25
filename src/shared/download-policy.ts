export const liveDownload = (status: string) =>
  [
    "awaiting-approval",
    "approving",
    "progressing",
    "paused",
    "finalizing",
  ].includes(status);
export function downloadName(raw: string) {
  let name =
    (raw.split(/[\\/]/).pop() || "download")
      .replace(
        /[<>:"/\\|?*\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
        "_",
      )
      .slice(0, 140)
      .replace(/[. ]+$/, "") || "download";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = "_" + name;
  return name;
}
export function downloadRisk(raw: string) {
  if (/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]|\s+\.[a-z0-9]+$/i.test(raw))
    return "Misleading or invisible filename characters";
  if (
    /\.(exe|msi|msix|msp|com|scr|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|url|reg|dll|sys|jar|iso|img|appx|sh|desktop|deb|rpm|dmg|pkg|pif|cpl|msc|inf|scf|chm|jnlp|application|appref-ms|docm|xlsm|pptm|py)(?:[. ]*)$/i.test(
      raw,
    )
  )
    return "Executable, script, installer, macro document, disk image or shortcut";
  if (/\.[a-z0-9]{1,8}\.[a-z0-9]{1,8}$/i.test(raw))
    return "Multiple filename extensions — check the actual file type";
  return "";
}
