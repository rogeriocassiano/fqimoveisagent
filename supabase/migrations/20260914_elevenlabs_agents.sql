-- Agentes de voz do ElevenLabs por perfil de treinamento
alter table training_profiles add column if not exists elevenlabs_agent_id text;

notify pgrst, 'reload schema';
