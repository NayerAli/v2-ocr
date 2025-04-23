# API Keys Configuration

This document explains how API keys are handled in the application.

## System API Key vs. User API Keys

The application supports two modes for API keys:

1. **System API Key**: A default API key provided by the system administrator
2. **User API Keys**: Individual API keys provided by each user

## System API Key

The system API key is defined in the `.env.local` file:

```
NEXT_PUBLIC_DEFAULT_OCR_API_KEY=your_default_ocr_api_key
```

This key is used when:
- A user has not provided their own API key
- A user has explicitly chosen to use the system API key

### Benefits of the System API Key

- Users can start using the application immediately without setting up their own API keys
- Administrators can control and monitor API usage
- Simplifies onboarding for new users

## User API Keys

Users can provide their own API keys in the settings dialog. When a user provides their own API key:

1. The system API key is no longer used for that user
2. All OCR processing for that user uses their personal API key
3. The user is responsible for any costs associated with their API key

### Benefits of User API Keys

- Users can use their own API accounts with their own billing
- Users can choose different API providers based on their needs
- Provides flexibility for advanced users

## How API Keys Are Stored

- API keys are stored in the user's settings in the database
- Each user's API key is only accessible to that user
- API keys are never shared between users

## Security Considerations

- The system API key is exposed to the client as it's in a NEXT_PUBLIC environment variable
- Consider implementing rate limiting or usage quotas to prevent abuse
- Monitor API usage regularly to detect unusual patterns

## Troubleshooting

If OCR processing is not working:

1. Check if the API key (system or user) is valid
2. Verify that the correct OCR provider is selected
3. Check if the API service is available
4. Look for error messages in the browser console
