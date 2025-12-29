import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Key } from "lucide-react";

export default function Settings() {
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-8 py-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your API keys and model configurations.</p>
        </div>

        <Card className="glass-panel border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Enter your API keys to enable AI generation features.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-2">
              <Label htmlFor="replicate-key">Replicate API Token</Label>
              <div className="flex gap-2">
                <Input 
                  id="replicate-key" 
                  type="password" 
                  placeholder="r8_..." 
                  className="bg-secondary/50 border-white/10 font-mono"
                />
                <Button variant="outline" className="border-white/10">Verify</Button>
              </div>
              <p className="text-[0.8rem] text-muted-foreground">
                Required for Ideogram, Flux, and Claude access via Replicate.
              </p>
            </div>

            <Separator className="bg-white/5" />

            <div className="space-y-2">
              <Label htmlFor="openai-key">OpenAI API Key (Optional)</Label>
              <Input 
                id="openai-key" 
                type="password" 
                placeholder="sk-..." 
                className="bg-secondary/50 border-white/10 font-mono"
              />
              <p className="text-[0.8rem] text-muted-foreground">
                Required if using GPT-4o for direct prompting.
              </p>
            </div>

            <div className="pt-4">
               <Button className="w-full bg-primary text-primary-foreground font-bold">
                 Save Credentials
               </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}