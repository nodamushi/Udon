import * as vscode from 'vscode';
import { Udon } from './udon';

let udon: Udon | null = null;

export function activate(context: vscode.ExtensionContext) {
	console.log("koko!");

	udon = new Udon(context);
	let disposable = vscode.commands.registerCommand('udon.pasteImage', async () => {
		if (udon) {
			await udon.pasteUdon();
		}
	});
	context.subscriptions.push(disposable);
}

export function deactivate() {
	if (udon) {
		udon.deactivate();
		udon = null;
	}
}
