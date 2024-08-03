export async function fetchChannels() {
    const response = await fetch('/HeadlineNews/Channel');
    if (!response.ok) throw new Error('Failed to fetch channels');
    return response.json();
  }
  
  export async function fetchContent() {
    const response = await fetch('/HeadlineNews/Content');
    if (!response.ok) throw new Error('Failed to fetch content');
    return response.json();
  }
  export async function fetchComent() {
    const response = await fetch('/HeadlineNews/Comment');
    if (!response.ok) throw new Error('Failed to fetch content');
    return response.json();
  }

