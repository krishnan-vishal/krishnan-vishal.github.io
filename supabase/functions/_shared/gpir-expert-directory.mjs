export async function expertDirectory(params, access, load) {
    if (access !== 'ALLOW') return { access };
    const read = name => (params.get(name) || '').trim().slice(0, 100);
    const page = Math.max(1, Math.min(1000, Number.parseInt(read('page'), 10) || 1));
    const result = await load({
        p_query: read('q'), p_region: read('region'), p_industry: '',
        p_topic: read('topic'), p_title: '', p_letter: '', p_page: page
    });
    if (!Array.isArray(result?.cards) || !Number.isSafeInteger(result?.total)) throw Error('Invalid directory');
    return { ...result, access };
}
