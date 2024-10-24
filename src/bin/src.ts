import { App } from 'aws-cdk-lib';
import { SrcStack } from '../lib/src-stack';
import { ContextParameters } from '../utils/context';

const app = new App();
const context = new ContextParameters(app);
new SrcStack(app, 'SrcStack', { context: context });
