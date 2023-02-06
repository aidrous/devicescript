import { CHANGE } from "jacdac-ts"
import * as vscode from "vscode"
import { toMarkdownString } from "./catalog"

import { DeviceScriptExtensionState } from "./state"
export function registerMainStatusBar(
    extensionState: DeviceScriptExtensionState
) {
    const { bus, context } = extensionState

    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        120
    )
    statusBarItem.command = "extension.devicescript.pickDeviceScriptManager"
    const updateStatusBar = () => {
        const service = extensionState.deviceScriptManager
        const mgr = service?.device
        const { runtimeVersion, nodeVersion, version, transport } =
            extensionState
        const devices = bus.devices({
            ignoreInfrastructure: true,
            announced: true,
        })
        statusBarItem.tooltip = !runtimeVersion
            ? `Starting DeviceScript Development Server...`
            : toMarkdownString(`
${
    mgr
        ? `Deploy and Debug on device ${mgr.shortId}`
        : `Click to pick a DeviceScript device`
}

---

${transport.transports.map(
    ({ type, connectionState, description }) => `
${type} - ${connectionState} ${description || ""}
`
)}

---

${runtimeVersion?.slice(1) || "?"} - runtime version   
${version?.slice(1) || "?"} - tools version     
${nodeVersion?.slice(1) || "?"} - node version     
        `)
        statusBarItem.text = [
            !runtimeVersion ? "$(loading~spin)" : "$(devicescript-logo)",
            "DeviceScript",
            ...transport.transports.map(
                tr =>
                    `$(${
                        tr.connectionState === "connected"
                            ? "plug"
                            : "debug-disconnect"
                    }) ${tr.type}`
            ),
            mgr ? `$(play) ${mgr?.shortId}` : "",
            devices.length > 0 ? `$(circuit-board) ${devices.length}` : "",
        ]
            .filter(p => !!p)
            .join(" ")
    }
    extensionState.on(CHANGE, updateStatusBar)
    extensionState.devtools.on(CHANGE, updateStatusBar)
    updateStatusBar()
    context.subscriptions.push(statusBarItem)
    statusBarItem.show()
}
