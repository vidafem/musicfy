import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const s3 = new S3Client({
  region: 'auto',
  endpoint: Deno.env.get('R2_ENDPOINT'),
  credentials: {
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  },
})

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  // Verificar que el usuario es admin via Supabase Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return new Response('Unauthorized', { status: 401 })
  
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  try {
    const { action, path, contentType, fileBase64 } = await req.json()

    if (action === 'upload') {
      const fileBuffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
      await s3.send(new PutObjectCommand({
        Bucket: Deno.env.get('R2_BUCKET_NAME'),
        Key: path,
        Body: fileBuffer,
        ContentType: contentType,
      }))
      
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
      return new Response(
        JSON.stringify({ url: `${Deno.env.get('R2_PUBLIC_URL')}/${path}` }),
        { status: 200, headers }
      )
    }

    if (action === 'delete') {
      await s3.send(new DeleteObjectCommand({
        Bucket: Deno.env.get('R2_BUCKET_NAME'),
        Key: path,
      }))
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers }
      )
    }

    return new Response('Bad Request', { status: 400 })
  } catch (error: any) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    )
  }
})
