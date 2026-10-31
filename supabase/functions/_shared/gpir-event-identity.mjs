// Fail-closed subject grouping. A source publisher is never part of topic identity.
// Structured canonical topic identifiers can group differently worded headlines only
// after upstream independent verification; otherwise exact normalized subjects only.
const normalize = v => String(v || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export async function eventIdentity(candidate, validation) {
 const subject=normalize(candidate.title);
 const type=normalize(candidate.event_type || 'announcement');
 const date=String(validation.sourcePublishedAt || '').slice(0,10);
 if(subject.length < 8 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
   throw new Error('G1_R07_EVENT_IDENTITY_REVIEW');
 const verifiedTopic=validation.verifiedTopicIdentity;
 const topic=verifiedTopic && verifiedTopic.verified === true &&
   typeof verifiedTopic.subject === 'string' && normalize(verifiedTopic.subject).length >= 8 &&
   Array.isArray(verifiedTopic.evidenceUrls) && verifiedTopic.evidenceUrls.length >= 2 &&
   verifiedTopic.evidenceUrls.every(url=>typeof url==='string' && url.startsWith('https://'))
   ? normalize(verifiedTopic.subject) : subject;
 // Deliberately omit source, event type and date: a topic persists across publishers
 // and milestones. Distinct subjects never merge by keyword similarity.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(topic));
 const key=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {p_event_key:key,p_issuer:String(candidate.source_id),p_event_type:type,
   p_subject:topic,p_event_date:date,p_geography:'UNSPECIFIED',
   p_keywords:validation.relevanceTerms || [],p_outcome_status:'PENDING'};
}
