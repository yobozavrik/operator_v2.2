export function getPoster2Env() {
    const account = (process.env.POSTER2_ACCOUNT || '').trim();
    const token = (process.env.POSTER2_TOKEN || '').trim();
    const schema = (process.env.POSTER2_SCHEMA || 'categories_poster2').trim() || 'categories_poster2';

    return {
        account,
        token,
        schema,
    };
}

export function assertPoster2Env() {
    const env = getPoster2Env();

    if (!env.account) {
        throw new Error('POSTER2_ACCOUNT environment variable is missing.');
    }

    if (!env.token) {
        throw new Error('POSTER2_TOKEN environment variable is missing.');
    }

    return env;
}
