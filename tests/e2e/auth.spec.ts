import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {

    test('should redirect unauthenticated user to login page', async ({ page }) => {
        // Try to access protected route
        await page.goto('/bi');

        // Should be redirected to login
        await expect(page).toHaveURL(/\/login/);

        // Check for login form elements
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /Sign In|Вход/i })).toBeVisible();
    });

    test('should allow access to login page directly', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('h1')).toContainText('GRAVITON');
    });

});
