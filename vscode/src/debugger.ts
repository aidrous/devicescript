import * as vscode from "vscode"
import { build } from "./build"
import { checkDeviceScriptManagerRuntimeVersion } from "./deploy"
import { ExtensionState } from "./state"
import { WorkspaceFolder, DebugConfiguration, CancellationToken } from "vscode"
import { JDBus, SRV_DEVICE_SCRIPT_MANAGER } from "jacdac-ts"

export class DeviceScriptAdapterServerDescriptorFactory
    implements vscode.DebugAdapterDescriptorFactory
{
    async createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined
    ) {
        const config = vscode.workspace.getConfiguration(
            "devicescript.debugger"
        )
        if (config.get("showTerminalOnStart"))
            vscode.commands.executeCommand(
                "extension.devicescript.showServerTerminal"
            )
        return new vscode.DebugAdapterServer(8083, "localhost")
    }

    dispose() {}
}

export interface DeviceScriptDebugConfiguration
    extends vscode.DebugConfiguration {
    /**
     * Device idenfier of the device manager device
     */
    deviceId?: string
    /**
     * Instance index of the device manager service. Default is 0
     */
    serviceIndex?: number
}

export class DeviceScriptConfigurationProvider
    implements vscode.DebugConfigurationProvider
{
    constructor(readonly bus: JDBus, readonly extensionState: ExtensionState) {}

    async resolveDebugConfigurationWithSubstitutedVariables(
        folder: vscode.WorkspaceFolder,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ) {
        if (token?.isCancellationRequested) return undefined

        // find device
        const dsConfig = config as DeviceScriptDebugConfiguration
        if (!dsConfig.deviceId) {
            const service =
                await this.extensionState.resolveDeviceScriptManager()
            const idx = service.device
                .services({ serviceClass: service.serviceClass })
                .indexOf(service)
            dsConfig.deviceId = service.device.deviceId
            dsConfig.serviceInstance = idx
        }

        if (token?.isCancellationRequested) return undefined

        // expand device short name
        if (/^[A-Z][A-Z][0-9][0-9]$/i.test(dsConfig.deviceId)) {
            const shortIdDevice = this.bus
                .devices({ serviceClass: SRV_DEVICE_SCRIPT_MANAGER })
                .find(d => d.shortId === dsConfig.deviceId)
            if (shortIdDevice) dsConfig.deviceId = shortIdDevice.deviceId
        }

        // find service
        const service = this.bus.device(dsConfig.deviceId, true)?.services({
            serviceClass: SRV_DEVICE_SCRIPT_MANAGER,
        })?.[dsConfig.serviceIndex || 0]
        if (!service) {
            vscode.window.showErrorMessage(
                `Debug cancelled. Could not find device ${dsConfig.deviceId}.`
            )
            return undefined
        }

        // check version
        const versionOk = await checkDeviceScriptManagerRuntimeVersion(
            this.extensionState.runtimeVersion,
            service
        )
        if (!versionOk) {
            // don't start debugging
            return undefined
        }

        // build and deploy
        if (!(await build(config.program, dsConfig.deviceId))) {
            return undefined
        }

        return config
    }

    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    async resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        token?: CancellationToken
    ) {
        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor
            if (editor && editor.document.languageId === "typescript") {
                config.type = "devicescript"
                config.name = "Launch"
                config.request = "launch"
                config.program = "${file}"
                config.stopOnEntry = true
            }
        }

        if (!config.program) {
            vscode.window.showInformationMessage(
                "Debug cancelled. Cannot find a program to debug."
            )
            return undefined
        }
        return config
    }
}
