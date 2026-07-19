import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 5;

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify the caller is authenticated
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");

  try {
    // Ensure buckets exist
    for (const bucket of ["products", "profiles"]) {
      const { data: existing } = await supabaseAdmin.storage.getBucket(bucket);
      if (!existing) {
        await supabaseAdmin.storage.createBucket(bucket, { public: true });
      }
    }

    if (productId) {
      // Migrate a single product
      const { data: product, error: fetchErr } = await supabaseAdmin
        .from("productos_farmacia")
        .select("id, image")
        .eq("id", productId)
        .single();

      if (fetchErr || !product || !product.image || !product.image.startsWith("data:")) {
        return new Response(JSON.stringify({ success: false, reason: "No base64 image found" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const result = await migrateSingleImage(supabaseAdmin, product.id, product.image);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Migrate all products with base64 images
    const { data: products, error: fetchErr } = await supabaseAdmin
      .from("productos_farmacia")
      .select("id, image, commercial_name")
      .not("image", "is", null)
      .neq("image", "")
      .limit(200);

    if (fetchErr || !products) {
      return new Response(JSON.stringify({ error: fetchErr?.message || "No products found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const base64Products = products.filter((p: any) => p.image && p.image.startsWith("data:"));
    const results = { total: base64Products.length, migrated: 0, failed: 0, errors: [] as string[] };

    for (let i = 0; i < base64Products.length; i += BATCH_SIZE) {
      const batch = base64Products.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((p: any) => migrateSingleImage(supabaseAdmin, p.id, p.image))
      );
      batchResults.forEach((r: any) => {
        if (r.success) results.migrated++;
        else { results.failed++; results.errors.push(r.error || "Unknown"); }
      });
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function migrateSingleImage(supabaseAdmin: any, productId: string, base64Image: string) {
  try {
    // Extract mime type and data
    const matches = base64Image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return { success: false, error: "Invalid base64 format" };
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";

    // Decode base64
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const timestamp = Date.now();
    const filePath = `${productId}_${timestamp}.${extension}`;
    const thumbPath = `${productId}_thumb_${timestamp}.${extension}`;

    // Upload main image
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("products")
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Upload failed: ${uploadErr.message}` };
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage.from("products").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    // Also upload a thumbnail version if we can create a smaller version
    // For now, just use the same image as thumbnail
    const { error: thumbErr } = await supabaseAdmin.storage
      .from("products")
      .upload(thumbPath, bytes, {
        contentType: mimeType,
        upsert: true,
      });

    // Update product record
    const { error: updateErr } = await supabaseAdmin
      .from("productos_farmacia")
      .update({ image: publicUrl })
      .eq("id", productId);

    if (updateErr) {
      return { success: false, error: `DB update failed: ${updateErr.message}` };
    }

    // Clean up old storage images for this product (keep only the new ones)
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

    return { success: true, url: publicUrl, productId };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
