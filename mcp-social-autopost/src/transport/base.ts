export interface PostResult {
  success: boolean;
  platform: string;
  post_id?: string;
  url?: string;
  error?: string;
  dry_run?: boolean;
  already_published?: boolean;
}

export interface PublishOptions {
  text: string;
  title?: string;
  image_path?: string;
  image_url?: string;
  hashtags?: string[];
  tags?: string[];
  poll?: string | null;
  scheduled_at?: string;
  /** Теги целей, которые нужно пропустить (идемпотентность). Напр. ["vk-group"]. */
  skip_targets?: string[];
}

export interface PlatformStatusRow {
  platform: string;
  displayName: string;
  configured: boolean;
  available: boolean;
  error: string;
}

export abstract class TransportAdapter {
  abstract readonly platform: string;
  abstract readonly displayName: string;

  abstract isConfigured(): boolean;
  abstract validateCredentials(): Promise<boolean>;
  abstract publish(options: PublishOptions): Promise<PostResult[]>;
  abstract uploadImage(imagePath: string): Promise<string>;
  abstract getPostStatus(postId: string): Promise<{ status: string; url?: string }>;
  abstract deletePost(postId: string): Promise<boolean>;

  /**
   * Переопределить, если платформа разбита на несколько целей (напр. VK: группа + личная).
   * Пустой массив (по умолчанию) означает «использовать одну строку из list-platforms».
   */
  async listTargetStatuses(): Promise<PlatformStatusRow[]> {
    return [];
  }
}