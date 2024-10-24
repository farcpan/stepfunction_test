export const firstHandler = async (event: any, context: any) => {
	const now = new Date().getTime() + 9 * 3600 * 1000; // 日本時間に変換
	// yyyy-MM-ddTHH:mm:ss.SSSZ -> ["yyyy-MM-dd", "HH:mm:ss.SSSZ"] -> ["yyyy", "MM", "dd"]
	const isoStringSplitted = new Date(now).toISOString().split('T')[0].split('-');
	const dateString = `${isoStringSplitted[0]}/${isoStringSplitted[1]}/${isoStringSplitted[2]}`;
	// return { tim: dateString };
	return [...Array(100)].map((_, index) => {
		return {
			tim: dateString,
			sIndex: index,
		};
	});
};

export const coreHandler = async (event: any, context: any) => {
	const { tim, sIndex } = event as { tim: string; sIndex: number };
	console.log(`${tim}: ${sIndex}`);

	if (sIndex === 10) {
		throw new Error('Dummy Error!');
	}

	return { result: 'success' };
};

export const lastHandler = async (event: any, context: any) => {
	console.log(event);
	console.log('[lastHandler]: success');
	return { result: 'success' };
};
