/**
 * Encrypted local backup and restore.
 *
 * Files never leave the device except through the user's share sheet. Receipt
 * images are not included; the screen states this explicitly. Restore is
 * replace-all over the financial tables after an explicit preview confirmation.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Share, Switch, TextInput, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import type { BackupPreview } from '@application/backup/backup.usecases';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { tryGetAppServices } from '@store/services-registry';

function PasswordField({
  label,
  value,
  onChangeText,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}): JSX.Element {
  const theme = useTheme();
  return (
    <View>
      <Text variant="caption" color="secondary" style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.surface,
          color: theme.colors.textPrimary,
          minHeight: 46,
          paddingHorizontal: spacing.md,
        }}
      />
    </View>
  );
}

export default function BackupScreen(): ReactNode {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string } | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [includeImages, setIncludeImages] = useState(true);

  const createBackup = async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    if (password.length < 8) {
      setMessage('Use a backup password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await services.backup.create.execute(password, { includeImages });
      const file = new File(Paths.cache, created.filename);
      file.create({ overwrite: true });
      file.write(created.envelopeJson);
      await Share.share({ url: file.uri, title: created.filename });
      const sizeMb = (created.preview.attachmentBytes / (1024 * 1024)).toFixed(1);
      setMessage(
        `Backup created: ${created.preview.counts.groups} groups, ${created.preview.counts.expenses} expenses, ` +
          `${created.preview.attachmentCount} receipt images (${sizeMb} MB). ` +
          (created.preview.missingImages.length > 0
            ? `${created.preview.missingImages.length} receipt file(s) were missing and excluded. `
            : '') +
          'Keep the password safe — it cannot be recovered.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup failed.');
    } finally {
      setBusy(false);
    }
  };

  const pickBackup = async (): Promise<void> => {
    setMessage(null);
    setPreview(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.assets?.[0];
      if (result.canceled || asset === undefined) return;
      setPickedFile({ uri: asset.uri, name: asset.name });
      setMessage(`Selected ${asset.name}. Enter its password and preview the contents.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open the file.');
    }
  };

  const inspectBackup = async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null || pickedFile === null) return;
    if (password.length === 0) {
      setMessage('Enter the backup password.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const text = await new File(pickedFile.uri).text();
      const result = await services.backup.inspect.execute(text, password);
      setPreview(result);
      setMessage('Preview ready. Review the counts before restoring.');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : 'Could not read this backup.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null || pickedFile === null || preview === null) return;

    Alert.alert(
      'Replace local data?',
      `This replaces ${preview.counts.groups} groups, ${preview.counts.expenses} expenses and ${preview.counts.settlements} settlements on this device. It cannot be undone. Receipt images are not included.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace data',
          style: 'destructive',
          onPress: (): void => {
            setBusy(true);
            void (async () => {
              try {
                const text = await new File(pickedFile.uri).text();
                await services.backup.restore.execute(text, password);
                setMessage('Restore complete. Restart BillLens to reload every screen.');
                setPreview(null);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Restore failed.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="lg" style={{ padding: spacing.xl }}>
        <Text variant="body" color="secondary">
          Backups are encrypted on this device with a password you choose. BillLens cannot recover
          a lost password. Older v1 backups contain financial data only; this screen shows whether
          attachments are present before you restore.
        </Text>

        <Card>
          <Stack gap="md">
            <Text variant="cardTitle">Create a backup</Text>
            <Row gap="md" align="center">
              <Stack gap={2} style={{ flex: 1 }}>
                <Text variant="body" color="primary">
                  Include receipt images
                </Text>
                <Text variant="caption" color="secondary">
                  Attachments are encrypted inside the same file (12 MB per image, 60 MB total).
                </Text>
              </Stack>
              <Switch
                value={includeImages}
                onValueChange={setIncludeImages}
                accessibilityLabel="Include receipt images in backup"
              />
            </Row>
            <PasswordField label="Backup password" value={password} onChangeText={setPassword} />
            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <Button
              label={busy ? 'Working…' : 'Create encrypted backup'}
              onPress={() => void createBackup()}
              disabled={busy}
              accessibilityLabel="Create encrypted backup"
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Text variant="cardTitle">Restore a backup</Text>
            {pickedFile !== null ? (
              <Text variant="caption" color="muted">
                {pickedFile.name}
              </Text>
            ) : null}
            <Row gap="sm">
              <Button
                label="Choose file"
                variant="secondary"
                size="sm"
                onPress={() => void pickBackup()}
                disabled={busy}
                accessibilityLabel="Choose a backup file"
              />
              <Button
                label="Preview"
                variant="ghost"
                size="sm"
                onPress={() => void inspectBackup()}
                disabled={busy || pickedFile === null}
                accessibilityLabel="Preview backup contents"
              />
            </Row>
            {preview !== null ? (
              <Stack gap={2}>
                <Text variant="bodyStrong">Ready to restore</Text>
                <Text variant="caption" color="secondary">
                  {preview.counts.groups} groups · {preview.counts.expenses} expenses ·{' '}
                  {preview.counts.settlements} settlements · {preview.counts.rows} rows
                </Text>
                <Text variant="caption" color="muted">
                  Format v{preview.formatVersion} · exported {preview.exportedAt.slice(0, 10)} ·
                  database v{preview.schemaVersion}
                </Text>
                <Text variant="caption" color="secondary">
                  {preview.includesAttachments
                    ? `${preview.attachmentCount} receipt images · ${(
                        preview.attachmentBytes /
                        (1024 * 1024)
                      ).toFixed(1)} MB`
                    : 'No receipt images in this backup (financial data only).'}
                </Text>
                <Button
                  label="Restore and replace data"
                  variant="secondary"
                  size="sm"
                  onPress={() => void restore()}
                  disabled={busy}
                  accessibilityLabel="Restore backup and replace local data"
                />
              </Stack>
            ) : null}
          </Stack>
        </Card>

        {message !== null ? (
          <Text variant="caption" color="secondary" accessibilityRole="alert">
            {message}
          </Text>
        ) : null}

        <Button
          label="Back to settings"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Back to settings"
        />
      </Stack>
    </Screen>
  );
}
