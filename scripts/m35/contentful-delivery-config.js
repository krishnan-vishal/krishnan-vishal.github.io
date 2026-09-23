'use strict';

const MODES = Object.freeze({
  delivery: Object.freeze({ host: 'cdn.contentful.com', tokenName: 'CONTENTFUL_DELIVERY_TOKEN' }),
  preview: Object.freeze({ host: 'preview.contentful.com', tokenName: 'CONTENTFUL_PREVIEW_TOKEN' })
});

function required(env, name) {
  const value = typeof env[name] === 'string' ? env[name].trim() : '';
  if (!value) throw new Error(`Missing required Contentful configuration: ${name}`);
  return value;
}

function contentfulDeliveryConfig(env = process.env, mode = 'delivery') {
  const selected = MODES[mode];
  if (!selected) throw new Error(`Unsupported Contentful delivery mode: ${mode}`);

  const token = required(env, selected.tokenName);
  const managementToken = typeof env.CONTENTFUL_MANAGEMENT_TOKEN === 'string'
    ? env.CONTENTFUL_MANAGEMENT_TOKEN.trim() : '';
  if (managementToken && token === managementToken)
    throw new Error('The Contentful Management API token cannot be used for frontend delivery.');

  return Object.freeze({
    mode,
    host: selected.host,
    token,
    tokenName: selected.tokenName,
    spaceId: required(env, 'CONTENTFUL_SPACE_ID'),
    environment: required(env, 'CONTENTFUL_ENVIRONMENT'),
    contentType: 'gpirPublication'
  });
}

function publicBuildMetadata(config) {
  return Object.freeze({
    mode: config.mode,
    host: config.host,
    spaceId: config.spaceId,
    environment: config.environment,
    contentType: config.contentType
  });
}

module.exports = { contentfulDeliveryConfig, publicBuildMetadata };

