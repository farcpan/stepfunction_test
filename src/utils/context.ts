import { App } from 'aws-cdk-lib';
import { readFileSync } from 'fs';

export interface StageParameters {
	region: string;
}

export class ContextParameters {
	systemName: string;
	env: string;
	version: string;
	stageParameters: StageParameters;

	constructor(app: App) {
		this.systemName = app.node.tryGetContext('systemName');
		this.env = app.node.tryGetContext('env');
		this.version = app.node.tryGetContext('version');
		console.log(`systemName: ${this.systemName}`);
		console.log(`env: ${this.env}`);
		console.log(`version: ${this.version}`);

		const filePath = __dirname + `/../cdk.${this.env}.json`;
		this.stageParameters = JSON.parse(readFileSync(filePath).toString()) as StageParameters;
		console.log('StageParameters: ');
		console.log(this.stageParameters);
	}

	public getResourceId = (resourceName: string): string => {
		return this.systemName + '-' + this.env + '-' + resourceName;
	};
}
