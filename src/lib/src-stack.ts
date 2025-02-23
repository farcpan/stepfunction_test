import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ContextParameters } from '../utils/context';
import { join } from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import {
	DefinitionBody,
	Fail,
	JsonPath,
	Map,
	StateMachine,
	TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';

interface SrcStackProps extends StackProps {
	context: ContextParameters;
}

export class SrcStack extends Stack {
	constructor(scope: Construct, id: string, props: SrcStackProps) {
		super(scope, id, props);

		///////////////////////////////////////////////////////////////////////////////////////
		// DynamoDB
		///////////////////////////////////////////////////////////////////////////////////////
		const stateMachineManageTableName = props.context.getResourceId('state-machine-manage');
		const statMachineManageTable = new Table(this, stateMachineManageTableName, {
			tableName: stateMachineManageTableName,
			billingMode: BillingMode.PAY_PER_REQUEST,
			partitionKey: { name: 'id', type: AttributeType.STRING },
			sortKey: { name: 'data_type', type: AttributeType.STRING },
			removalPolicy: RemovalPolicy.DESTROY,
			timeToLiveAttribute: 'ttl',
		});

		///////////////////////////////////////////////////////////////////////////////////////
		// Lambdas first -> core -> last
		///////////////////////////////////////////////////////////////////////////////////////
		const lambdaFunctionPath = join(__dirname, '../lambdas/index.ts');

		const firstFunctionName = props.context.getResourceId('first-func');
		const firstFunction = new NodejsFunction(this, firstFunctionName, {
			functionName: firstFunctionName,
			entry: lambdaFunctionPath,
			handler: 'firstHandler',
			runtime: Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			environment: {
				tableName: statMachineManageTable.tableName,
			},
		});
		statMachineManageTable.grantReadWriteData(firstFunction);

		const coreFunctionName = props.context.getResourceId('core-func');
		const coreFunction = new NodejsFunction(this, coreFunctionName, {
			functionName: coreFunctionName,
			entry: lambdaFunctionPath,
			handler: 'coreHandler',
			runtime: Runtime.NODEJS_20_X,
			timeout: Duration.minutes(1),
			environment: {},
		});

		const lastFunctionName = props.context.getResourceId('last-func');
		const lastFunction = new NodejsFunction(this, lastFunctionName, {
			functionName: lastFunctionName,
			entry: lambdaFunctionPath,
			handler: 'lastHandler',
			runtime: Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			environment: {},
		});

		///////////////////////////////////////////////////////////////////////////////////////
		// Step Functions
		///////////////////////////////////////////////////////////////////////////////////////
		// Task for first function
		const firstTaskName = props.context.getResourceId('first-task');
		const firstTask = new LambdaInvoke(this, firstTaskName, {
			stateName: firstTaskName,
			lambdaFunction: firstFunction,
			outputPath: '$.Payload',
		})
			.addRetry({
				interval: Duration.seconds(2),
				maxAttempts: 3,
				backoffRate: 2.0,
				errors: ['States.ALL'],
			})
			.addCatch(
				new Fail(this, props.context.getResourceId('first-task-failure'), {
					error: 'States.ALL',
					cause: 'Lambda function failed after retries',
				})
			);

		// Tasks for core function
		const coreTasksName = props.context.getResourceId('core-tasks');
		const coreEachTaskName = props.context.getResourceId('core-task');
		const coreTasksParallel = new Map(this, coreTasksName, {
			stateName: coreTasksName,
			maxConcurrency: 2,
			itemsPath: '$',
		})
			.itemProcessor(
				new LambdaInvoke(this, coreEachTaskName, {
					lambdaFunction: coreFunction,
					payload: TaskInput.fromObject({
						tim: JsonPath.stringAt('$.tim'),
						sIndex: JsonPath.numberAt('$.sIndex'),
					}),
				})
			)
			.addCatch(new Fail(this, props.context.getResourceId('core-task-failed')), {
				errors: ['States.ALL'],
			});

		// Task for last function
		const lastTaskName = props.context.getResourceId('last-task');
		const lastTask = new LambdaInvoke(this, lastTaskName, {
			lambdaFunction: lastFunction,
		});

		// Step Functions
		const stepFunctionDefinition = firstTask.next(coreTasksParallel).next(lastTask);

		const stateMachineName = props.context.getResourceId('state-machine');
		const stateMachine = new StateMachine(this, stateMachineName, {
			stateMachineName: stateMachineName,
			timeout: Duration.days(1),
			// definition: stepFunctionDefinition,
			definitionBody: DefinitionBody.fromChainable(stepFunctionDefinition),
		});

		// EventBridge
		const eventName = props.context.getResourceId('event');
		const rule = new Rule(this, eventName, {
			schedule: Schedule.cron({ minute: '*/1', hour: '*' }),
		});
		rule.addTarget(
			new SfnStateMachine(stateMachine, {
				retryAttempts: 2,
				// maxEventAge:
			})
		);
	}
}
