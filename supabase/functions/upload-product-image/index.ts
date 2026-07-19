import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { productId, base64Image, mimeType } = body;

    if (!productId || !base64Image) {
      return new Response(JSON.stringify({ error: "Missing productId or base64Image" }), { status: 400 });
    }

    // Ensure buckets exist
    for (const bucket of ["products", "profiles"]) {
      const { data: existing } = await supabaseAdmin.storage.getBucket(bucket);
      if (!existing) {
        await supabaseAdmin.storage.createBucket(bucket, { public: true });
      }
    }

    // Extract base64 data
    const matches = base64Image.match(/^data:(image\/\w+);base64,(.+)$/);
    let rawBase64 = base64Image;
    let contentType = mimeType || "image/jpeg";

    if (matches) {
      contentType = matches[1];
      rawBase64 = matches[2];
    }

    // Decode base64 to bytes
    const binaryString = atob(rawBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const timestamp = Date.now();
    const filePath = `${productId}_${timestamp}.${extension}`;
    const thumbPath = `${productId}_thumb_${timestamp}.${extension}`;

    // Upload main image
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("products")
      .upload(filePath, bytes, { contentType, upsert: true });

    if (uploadErr) {
      return new Response(JSON.stringify({ error: `Upload failed: ${uploadErr.message}` }), { status: 500 });
    }

    // Upload thumbnail (same image for now)
    await supabaseAdmin.storage
      .from("products")
      .upload(thumbPath, bytes, { contentType, upsert: true });

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage.from("products").getPublicUrl(filePath);
    const { data: thumbData } = supabaseAdmin.storage.from("products").getPublicUrl(thumbPath);

    // Clean old images for this product
    const { data: existingFiles } = await supabaseAdmin.storage
      .from("products")
      .list("", { search: productId });
    if (existingFiles) {
      const oldFiles = existingFiles
        .filter((f: any) => !f.name.includes(String(timestamp)))
        .map((f: any) => f.name);
      if (oldFiles.length > 0) {
        await supabaseAdmin.storage.from("products").remove(oldFiles);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      url: urlData.publicUrl,
      thumbUrl: thumbData.publicUrl,
      path: filePath,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
