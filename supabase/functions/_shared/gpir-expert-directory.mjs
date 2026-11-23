export async function expertDirectory(params, access, load) {
    if (access !== 'ALLOW') return { access };
    const read = name => (params.get(name) || '').trim().slice(0, 100);
    const letter = read('letter').toUpperCase();
    const page = read('page');
    const result = await load({
        p_query: read('q'), p_region: read('region'), p_industry: read('industry'),
        p_topic: read('topic'), p_title: read('title'),
        p_letter: /^[A-Z]$/.test(letter) ? letter : '',
        p_page: /^\d{1,4}$/.test(page) ? Math.max(1, Math.min(1000, Number(page))) : 1
    });
    if (!Array.isArray(result?.cards) || !Number.isSafeInteger(result?.total)) throw Error('Invalid directory');
    return { ...result, access };
}
