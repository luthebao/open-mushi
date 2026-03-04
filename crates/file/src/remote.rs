use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use reqwest::header::CONTENT_LENGTH;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

pub async fn upload(
    presigned_urls: Vec<String>,
    local_path: std::path::PathBuf,
) -> Result<Vec<String>, crate::Error> {
    // TODO
    const CHUNK_SIZE: usize = 60 * 1024 * 1024;

    let file = tokio::fs::File::open(&local_path).await?;
    let file_size = file.metadata().await?.len() as usize;

    let mut tasks = Vec::new();
    let client = reqwest::Client::new();

    for (chunk_index, presigned_url) in presigned_urls.into_iter().enumerate() {
        let start = chunk_index * CHUNK_SIZE;
        let end = (start + CHUNK_SIZE).min(file_size);
        let length = end - start;

        let local_path = local_path.clone();
        let client = client.clone();

        let task: tokio::task::JoinHandle<Result<String, crate::Error>> =
            tokio::spawn(async move {
                let mut file = tokio::fs::File::open(&local_path).await?;
                file.seek(std::io::SeekFrom::Start(start as u64)).await?;

                let mut buffer = vec![0; length];
                let n_read = file.read_exact(&mut buffer).await?;
                buffer.shrink_to(n_read);

                let mut hasher = crc32fast::Hasher::new();
                hasher.update(&buffer);
                let checksum = hasher.finalize();
                let checksum_b64 = BASE64.encode(checksum.to_be_bytes());

                let response = client
                    .put(&presigned_url)
                    .header(CONTENT_LENGTH, length.to_string())
                    .header("x-amz-checksum-algorithm", "CRC32")
                    .header("x-amz-checksum-crc32", checksum_b64)
                    .body(buffer)
                    .send()
                    .await?;

                if !response.status().is_success() {
                    let body = response.text().await?;
                    return Err(crate::Error::OtherError(body));
                }

                let etag = response
                    .headers()
                    .get("ETag")
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_string();

                Ok(etag)
            });

        tasks.push(task);
    }

    let results = futures_util::future::join_all(tasks).await;
    let etags = results
        .into_iter()
        .map(|result| result.unwrap().unwrap())
        .collect::<Vec<String>>();

    Ok(etags)
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    // TODO: test_upload removed — it depended on openmushi_s3 (cloud dep stripped).
    // Re-add once a local S3 client wrapper is available.
}
