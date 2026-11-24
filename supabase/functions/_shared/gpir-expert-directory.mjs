export async function expertDirectory(params, access, load) {
    if (access !== 'ALLOW') return { access };
    const read = name => (params.get(name) || '').trim().slice(0, 100);
    const result = await load({
        p_query: read('q'), p_region: read('region'), p_jurisdiction: read('jurisdiction'),
        p_page: 1
    });
    if (!Array.isArray(result?.cards) || !Number.isSafeInteger(result?.total)) throw Error('Invalid directory');
    return { ...result, access };
}
