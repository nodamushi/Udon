import * as vscode from 'vscode';
import { Udon } from './udon';

let udon: Udon | null = null;

export async function activate(context: vscode.ExtensionContext) {
	udon = new Udon(context);
	let disposable = vscode.commands.registerCommand('udon.pasteImage', async () => {
		if (udon) {
			await udon.pasteUdon();
		}
	});
	context.subscriptions.push(disposable);
	await udon.auto_download_pre_build();
}

export function deactivate() {
	if (udon) {
		udon.deactivate();
		udon = null;
	}
}
