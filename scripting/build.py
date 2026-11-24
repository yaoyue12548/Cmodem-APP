"""Build an offline Scripting import package using only the standard library."""
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

source = Path(__file__).resolve().parent
assets = source.parent / "app/src/main/assets"
output = Path(sys.argv[1]) if len(sys.argv) > 1 else source / "Cmodem.scripting"
core_files = ["network_mode.js", "device_address.js", "upstream_local.js",
              "air6_api.js", "lan_api.js", "lan_runtime.js"]
board_files = ["fhcpeweb.html", "device_address.js", "lan_ui.js", "upstream_images.js",
               "android_ui.css", "lg6851f_image.js", "air6_automation.js", "air6_ui.js",
               "sms_cards.js"]

def read(path):
    return path.read_text(encoding="utf-8-sig")

def inline(code):
    return "<script>" + code.replace("</script", r"<\/script") + "</script>"

core = [inline(read(source / "sms-pdu.js")), inline(read(source / "core.js"))]
for name in core_files:
    code = read(assets / name)
    if name == "lan_runtime.js":
        code = code.replace("'Android '+appVersionLabel()", "'iOS Scripting'")
    core.append(inline(code))
version = json.loads(read(source / "script.json"))["version"]
history = json.loads(read(source / "changelog.json"))
if history["logs"][0]["ver"] != version:
    raise ValueError("The newest changelog entry must match the script version")
resources = {
    "version": version,
    "coreScripts": "".join(core),
    "boardBridge": read(source / "board.js"),
    "assets": {name: read(assets / name) for name in board_files},
}
resources["assets"]["changelog.json"] = json.dumps(history, ensure_ascii=False)
generated = "export default " + json.dumps(resources, ensure_ascii=True) + "\n"
with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as package:
    for name in ["index.tsx", "present.tsx", "script.json"]:
        package.write(source / name, name)
    package.writestr("resources.ts", generated)
print(output.resolve())
