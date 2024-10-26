import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

export const firstHandler = async (event: any, context: any) => {
	// 環境変数
	const tableName = process.env['tableName'];
	if (!tableName) {
		throw new Error('env variable: `tableName` not set.');
	}

	const eventId = event.id;

	const now = new Date().getTime() + 9 * 3600 * 1000; // 日本時間に変換
	// yyyy-MM-ddTHH:mm:ss.SSSZ -> ["yyyy-MM-dd", "HH:mm:ss.SSSZ"] -> ["yyyy", "MM", "dd"]
	const isoStringSplitted = new Date(now).toISOString().split('T')[0].split('-');
	const dateString = `${isoStringSplitted[0]}/${isoStringSplitted[1]}/${isoStringSplitted[2]}`;

	// 多重起動防止
	const client = new DynamoDBClient();
	const docClient = DynamoDBDocumentClient.from(client);
	try {
		await docClient.send(
			new UpdateCommand({
				TableName: tableName,
				Key: {
					id: eventId,
					data_type: 'EVENT_DUPLICATION',
				},
				UpdateExpression: 'SET #ttl = :ttl',
				ExpressionAttributeNames: {
					'#ttl': 'ttl',
				},
				ExpressionAttributeValues: {
					':ttl': new Date().getTime() / 1000 + 3600, // 1時間後にTTL削除
				},
				ConditionExpression: 'attribute_not_exists(tim)',
			})
		);
	} catch (e) {
		if (e instanceof ConditionalCheckFailedException) {
			// 多重起動の場合は次のステップに遷移させる
			console.error(e);
			return [];
		} else {
			// それ以外のエラーが発生したケースは失敗とする
			throw new Error(JSON.stringify(e));
		}
	}

	// 次のLambdaに渡す値
	const targetData = [...Array(100)].map((_, index) => {
		return {
			tim: dateString,
			sIndex: index,
		};
	});

	// DynamoDBにも書き込む
	await docClient.send(
		new TransactWriteCommand({
			TransactItems: targetData.map((data) => {
				return {
					Update: {
						TableName: tableName,
						Key: {
							id: 'EXECUTION_HISTORY',
							data_type: `${data.tim}|${data.sIndex}`,
						},
						UpdateExpression: 'SET #ttl = :ttl',
						ExpressionAttributeNames: {
							'#ttl': 'ttl',
						},
						ExpressionAttributeValues: {
							':ttl': new Date().getTime() / 1000 + 3600, // 1時間後にTTL削除
						},
					},
				};
			}),
		})
	);

	return targetData;
};

export const coreHandler = async (event: any, context: any) => {
	const { tim, sIndex } = event as { tim: string; sIndex: number };
	console.log(`${tim}: ${sIndex}`);

	/*
	if (sIndex === 10) {
		throw new Error('Dummy Error!');
	}
    */

	return { result: 'success' };
};

export const lastHandler = async (event: any, context: any) => {
	console.log(event);
	console.log('[lastHandler]: success');
	return { result: 'success' };
};
